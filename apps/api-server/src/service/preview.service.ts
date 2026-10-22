import { randomBytes } from "node:crypto"
import { prisma } from "@forgeAI/database"
import {
  PROXIED_PREVIEW_IFRAME_SANDBOX,
  type DevServerStatus,
  type PreviewLinkStatus,
  safePreviewUrl,
} from "@forgeAI/shared"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { redis } from "../lib/redis.js"
import { ENV_CONFIG } from "../lib/envConfig.js"
import { canAccessLiveProject, canAccessProject } from "./build.service.js"
import {
  callOrchestrator,
  podPath,
  type SandboxResult,
} from "./sandbox.service.js"

type PreviewFailure =
  "not_found" | "no_pod" | "not_live" | "unsafe_target" | "orchestrator_failed"

type PreviewResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: PreviewFailure; message?: string }

const GLOBAL_PROJECT_TOKEN_PREFIX = "preview:global:project:"
const GLOBAL_TOKEN_PREFIX = "preview:global:token:"

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

const STRIPPED_RESPONSE_HEADERS = new Set([
  ...HOP_BY_HOP_HEADERS,
  "content-encoding",
  "content-length",
  "content-security-policy",
  "set-cookie",
  "x-frame-options",
])

const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-type",
  "user-agent",
])

const PREVIEW_PROXY_CSP = [
  `sandbox ${PROXIED_PREVIEW_IFRAME_SANDBOX}`,
  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  "connect-src * ws: wss: data: blob:",
  "img-src * data: blob:",
  "font-src * data: blob:",
  "media-src * data: blob:",
  "style-src * 'unsafe-inline' data: blob:",
  "worker-src * blob:",
  "child-src * blob:",
  "frame-src *",
].join("; ")

function originOf(value: string): string {
  return new URL(value).origin
}

function globalProjectTokenKey(projectId: string): string {
  return `${GLOBAL_PROJECT_TOKEN_PREFIX}${projectId}:token`
}

function globalProjectEnabledKey(projectId: string): string {
  return `${GLOBAL_PROJECT_TOKEN_PREFIX}${projectId}:enabled`
}

function globalTokenKey(token: string): string {
  return `${GLOBAL_TOKEN_PREFIX}${token}`
}

export function privatePreviewUrl(projectId: string): string {
  return `${originOf(ENV_CONFIG.BETTER_AUTH_URL)}/api/v1/preview/project/${encodeURIComponent(projectId)}/`
}

export function publicPreviewUrl(token: string): string {
  return `${originOf(ENV_CONFIG.PREVIEW_PUBLIC_ORIGIN)}/api/v1/preview/public/${encodeURIComponent(token)}/`
}

async function liveProjectExists(projectId: string): Promise<boolean> {
  const count = await prisma.project.count({
    where: {
      id: projectId,
      archivedAt: null,
      workspace: { archivedAt: null },
    },
  })
  return count > 0
}

async function currentDevStatus(
  app: FastifyInstance,
  projectId: string,
): Promise<SandboxResult<DevServerStatus>> {
  return callOrchestrator<DevServerStatus>(
    app,
    "GET",
    podPath(projectId, "/dev"),
  )
}

async function currentPreviewTarget(
  app: FastifyInstance,
  projectId: string,
): Promise<PreviewResult<{ url: string }>> {
  const status = await currentDevStatus(app, projectId)
  if (!status.ok) {
    return {
      ok: false,
      reason: status.reason === "no_pod" ? "no_pod" : "orchestrator_failed",
      message: status.message,
    }
  }
  if (status.data.state !== "live" || !status.data.previewUrl)
    return { ok: false, reason: "not_live" }

  const url = safePreviewUrl(status.data.previewUrl)
  return url
    ? { ok: true, data: { url } }
    : { ok: false, reason: "unsafe_target" }
}

async function globalTokenForProject(
  projectId: string,
): Promise<string | null> {
  return redis.get(globalProjectTokenKey(projectId))
}

async function ensureGlobalToken(projectId: string): Promise<string> {
  const existing = await globalTokenForProject(projectId)
  if (existing) {
    await redis.set(globalTokenKey(existing), projectId)
    return existing
  }

  const token = randomBytes(24).toString("base64url")
  const created = await redis.set(globalProjectTokenKey(projectId), token, "NX")
  const stored = created ? token : await globalTokenForProject(projectId)
  const finalToken = stored ?? token
  await redis.set(globalTokenKey(finalToken), projectId)
  return finalToken
}

export async function getPreviewLinkStatus(
  app: FastifyInstance,
  userId: string,
  projectId: string,
): Promise<PreviewResult<PreviewLinkStatus>> {
  if (!(await canAccessLiveProject(userId, projectId)))
    return { ok: false, reason: "not_found" }

  const [token, enabled, target] = await Promise.all([
    globalTokenForProject(projectId),
    redis.get(globalProjectEnabledKey(projectId)),
    currentPreviewTarget(app, projectId),
  ])

  return {
    ok: true,
    data: {
      previewUrl: privatePreviewUrl(projectId),
      devLive: target.ok,
      globalEnabled: enabled === "1",
      ...(token && { globalUrl: publicPreviewUrl(token) }),
    },
  }
}

export async function createGlobalPreviewLink(
  app: FastifyInstance,
  userId: string,
  projectId: string,
): Promise<PreviewResult<PreviewLinkStatus>> {
  if (!(await canAccessProject(userId, projectId, "write")))
    return { ok: false, reason: "not_found" }

  const target = await currentPreviewTarget(app, projectId)
  if (!target.ok) return target

  const token = await ensureGlobalToken(projectId)
  await redis.set(globalProjectEnabledKey(projectId), "1")
  return {
    ok: true,
    data: {
      previewUrl: privatePreviewUrl(projectId),
      devLive: true,
      globalEnabled: true,
      globalUrl: publicPreviewUrl(token),
    },
  }
}

export async function stopGlobalPreviewLink(
  app: FastifyInstance,
  userId: string,
  projectId: string,
): Promise<PreviewResult<PreviewLinkStatus>> {
  if (!(await canAccessProject(userId, projectId, "write")))
    return { ok: false, reason: "not_found" }

  const token = await globalTokenForProject(projectId)
  const target = await currentPreviewTarget(app, projectId)
  await redis.set(globalProjectEnabledKey(projectId), "0")
  return {
    ok: true,
    data: {
      previewUrl: privatePreviewUrl(projectId),
      devLive: target.ok,
      globalEnabled: false,
      ...(token && { globalUrl: publicPreviewUrl(token) }),
    },
  }
}

async function projectIdForPublicToken(token: string): Promise<string | null> {
  const projectId = await redis.get(globalTokenKey(token))
  if (!projectId) return null
  if ((await redis.get(globalProjectEnabledKey(projectId))) !== "1") return null
  return (await liveProjectExists(projectId)) ? projectId : null
}

function wildcardPath(request: FastifyRequest): string {
  const params = request.params as { "*": string | undefined }
  return params["*"] ?? ""
}

function queryOf(request: FastifyRequest): string {
  const index = request.url.indexOf("?")
  return index === -1 ? "" : request.url.slice(index)
}

function targetUrl(base: string, request: FastifyRequest): string {
  const target = new URL(
    wildcardPath(request),
    base.endsWith("/") ? base : `${base}/`,
  )
  target.search = queryOf(request).replace(/^\?/, "")
  return target.href
}

function proxiedRequestHeaders(request: FastifyRequest): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    const lower = key.toLowerCase()
    if (!FORWARDED_REQUEST_HEADERS.has(lower)) continue
    if (Array.isArray(value)) headers.set(key, value.join(", "))
    else if (value !== undefined) headers.set(key, String(value))
  }
  headers.set("accept-encoding", "identity")
  return headers
}

function requestBody(request: FastifyRequest): string | Uint8Array | undefined {
  if (request.method === "GET" || request.method === "HEAD") return undefined
  const body = request.body
  if (body === undefined) return undefined
  if (typeof body === "string" || body instanceof Uint8Array) return body
  return JSON.stringify(body)
}

function proxyBaseUrl(mode: "private" | "public", id: string): string {
  return mode === "private" ? privatePreviewUrl(id) : publicPreviewUrl(id)
}

function rewriteLocation(
  location: string,
  target: string,
  targetBase: string,
  proxyBase: string,
): string {
  try {
    const resolved = new URL(location, target)
    const base = new URL(targetBase)
    if (resolved.origin !== base.origin) return location
    return new URL(
      `${resolved.pathname.replace(/^\//, "")}${resolved.search}${resolved.hash}`,
      proxyBase,
    ).href
  } catch {
    return location
  }
}

function copyResponseHeaders(
  response: Response,
  reply: FastifyReply,
  target: string,
  targetBase: string,
  proxyBase: string,
): void {
  response.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (STRIPPED_RESPONSE_HEADERS.has(lower)) return
    reply.header(
      key,
      lower === "location"
        ? rewriteLocation(value, target, targetBase, proxyBase)
        : value,
    )
  })
  reply.header("cache-control", "no-store")
  reply.header("content-security-policy", PREVIEW_PROXY_CSP)
  reply.header("referrer-policy", "no-referrer")
  reply.header("x-forgeai-preview-proxy", "1")
}

export async function proxyPreview(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  input:
    { mode: "private"; projectId: string } | { mode: "public"; token: string },
): Promise<FastifyReply | void> {
  const projectId =
    input.mode === "private"
      ? input.projectId
      : await projectIdForPublicToken(input.token)
  if (!projectId) return reply.status(404).send({ error: "Preview not found" })

  const target = await currentPreviewTarget(app, projectId)
  if (!target.ok) {
    const status = target.reason === "not_live" ? 409 : 404
    return reply.status(status).send({
      error:
        target.reason === "not_live"
          ? "The dev server is not running."
          : "Preview not found.",
    })
  }

  const url = targetUrl(target.data.url, request)
  const response = await fetch(url, {
    method: request.method,
    headers: proxiedRequestHeaders(request),
    body: requestBody(request),
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  })
  copyResponseHeaders(
    response,
    reply,
    url,
    target.data.url,
    proxyBaseUrl(
      input.mode,
      input.mode === "private" ? projectId : input.token,
    ),
  )
  reply.status(response.status)
  if (request.method === "HEAD" || !response.body) return reply.send()
  return reply.send(Buffer.from(await response.arrayBuffer()))
}
