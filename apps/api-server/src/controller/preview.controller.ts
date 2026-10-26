import type { FastifyReply, FastifyRequest } from "fastify"
import { requireSession } from "../lib/session.js"
import {
  createGlobalPreviewLink,
  getPreviewLinkStatus,
  proxyPreview,
  stopGlobalPreviewLink,
} from "../service/preview.service.js"
import { canAccessLiveProject } from "../service/build.service.js"

interface ProjectParams {
  id: string
}

interface PreviewProjectParams {
  projectId: string
}

interface PreviewPublicParams {
  token: string
}

function sendPreviewFailure(
  reply: FastifyReply,
  reason: string,
  message?: string,
) {
  switch (reason) {
    case "not_found":
    case "no_pod":
      return reply.status(404).send({ error: "Project not found" })
    case "not_live":
      return reply.status(409).send({
        error: "Start the dev server before creating a global link.",
      })
    case "unsafe_target":
      return reply.status(409).send({
        error: "The sandbox preview URL is not from a trusted provider host.",
      })
    default:
      return reply.status(502).send({
        error: message ?? "Couldn't reach the sandbox preview.",
      })
  }
}

export async function getPreviewLinkStatusHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await getPreviewLinkStatus(
    request.server,
    session.user.id,
    request.params.id,
  )
  return result.ok
    ? result.data
    : sendPreviewFailure(reply, result.reason, result.message)
}

export async function createGlobalPreviewLinkHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await createGlobalPreviewLink(
    request.server,
    session.user.id,
    request.params.id,
  )
  return result.ok
    ? result.data
    : sendPreviewFailure(reply, result.reason, result.message)
}

export async function stopGlobalPreviewLinkHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await stopGlobalPreviewLink(
    request.server,
    session.user.id,
    request.params.id,
  )
  return result.ok
    ? result.data
    : sendPreviewFailure(reply, result.reason, result.message)
}

export async function privatePreviewProxyHandler(
  request: FastifyRequest<{ Params: PreviewProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  if (
    !(await canAccessLiveProject(session.user.id, request.params.projectId))
  ) {
    return reply.status(404).send({ error: "Preview not found" })
  }

  return proxyPreview(request.server, request, reply, {
    mode: "private",
    projectId: request.params.projectId,
  })
}

export async function publicPreviewProxyHandler(
  request: FastifyRequest<{ Params: PreviewPublicParams }>,
  reply: FastifyReply,
) {
  return proxyPreview(request.server, request, reply, {
    mode: "public",
    token: request.params.token,
  })
}
