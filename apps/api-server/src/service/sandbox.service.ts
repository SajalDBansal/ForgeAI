import { prisma } from "@forgeAI/database"
import type {
  DevCommandSettings,
  EnsurePodResponse,
  ListPodFilesQuery,
  PodFileListing,
  PodRecord,
  WritePodFileDataType,
} from "@forgeAI/shared"
import { REQUEST_ID_HEADER } from "@forgeAI/shared"
import type { FastifyInstance } from "fastify"
import {
  canAccessProject,
  canAccessLiveProject,
  liveProjectFilter,
  projectAccessFilter,
  runtimeSecretsFor,
} from "./build.service.js"
import { ENV_CONFIG } from "../lib/envConfig.js"
import { publishProjectEvent } from "../lib/project-events.js"
import { currentRequestId } from "../plugins/request-context.js"
import {
  chooseTemplateNameForPrompt,
  stackNamesFromTemplate,
} from "./template-selection.service.js"

/** Template a project boots from when nothing more specific applies (a `packages/templates` name). */
const DEFAULT_TEMPLATE_NAME = "nextjs-starter"

/**
 * Where a project's sandbox image comes from, derived from the project row (never the browser).
 * TEMPLATE = picked up front; AGENT = chosen by the agent from a prompt; REPO = follows an imported repo.
 */
export type SandboxOrigin = "TEMPLATE" | "AGENT" | "REPO"

/** A published template as far as opening a sandbox cares. Runtime columns are nullable until the next sync. */
interface TemplateForSandbox {
  id: string
  name: string
  description: string
  tag: string
  /** Published version behind the image; recorded on snapshots. */
  version: string
  /** The image the published version boots from, as the provider names it. */
  imageRef: string
  devCommand: string | null
  devPort: number | null
  installCommand: string | null
  metadata: unknown
}

export interface ProjectForSandbox {
  id: string
  source: string
  initialPrompt: string
  templateId: string | null
  template: TemplateForSandbox | null
  /** Project override of the run command; null means inherit the template's. */
  devCommand: string | null
  devPort: number | null
  /** The workspace owner, whose sandbox limit a new sandbox counts against. */
  workspace: { userId: string }
}

// Works out where a project's sandbox image should come from.
// Drives which resolver picks the template.
export function sandboxOriginOf(project: ProjectForSandbox): SandboxOrigin {
  if (project.templateId) return "TEMPLATE"
  if (project.source !== "MANUAL") return "REPO"
  return "AGENT"
}

/** The template an origin picked, or undefined to fall back to the default. */
type ResolvedTemplate = TemplateForSandbox | undefined

/** Which image to boot and what to run in it, with project overrides already applied. */
export interface ProjectRuntime {
  templateName: string
  image: string
  /** Published version behind `image`, for snapshots to record. */
  templateVersion: string
  devCommand: string
  devPort: number
  /** Quoted in "dependency missing" errors; null keeps that message generic. */
  installCommand: string | null
}

// Returns the template the user picked when creating the project.
// The only origin implemented today.
function resolveFromTemplate(project: ProjectForSandbox): ResolvedTemplate {
  return project.template ?? undefined
}

// Picks a template for a prompt-started project and persists it, so future opens use TEMPLATE.
async function resolveFromAgent(
  project: ProjectForSandbox,
): Promise<ResolvedTemplate> {
  const templates = await prisma.template.findMany({
    where: { workspaceId: null },
    select: templateForSandboxSelect,
  })
  if (templates.length === 0) return undefined

  const name = chooseTemplateNameForPrompt(project.initialPrompt, templates)
  const selected =
    templates.find((template) => template.name === name) ??
    templates.find((template) => template.name === DEFAULT_TEMPLATE_NAME) ??
    templates[0]
  if (!selected) return undefined

  const updated = await prisma.project.updateMany({
    where: { id: project.id, templateId: null },
    data: { templateId: selected.id, stack: stackNamesFromTemplate(selected) },
  })
  if (updated.count > 0) {
    await prisma.template.update({
      where: { id: selected.id },
      data: { uses: { increment: 1 } },
    })
    return selected
  }

  // Another request picked first; use its choice so repeated opens are stable.
  const current = await prisma.project.findUnique({
    where: { id: project.id },
    select: { template: { select: templateForSandboxSelect } },
  })
  return current?.template ?? selected
}

// Picks an image suited to an imported repo's stack (falls back to the default for now).
// TODO: detect the stack from the repo's manifests and map it to a published template.
function resolveFromRepo(): ResolvedTemplate {
  return undefined
}

// ---------- ORCHESTRATOR CLIENT ----------

/**
 * `conflict` is the orchestrator's deliberate 409 "no", not a fault; `message` carries its words.
 * `owner_limit` (429), `busy` and `budget` (503) are its capacity refusals (E7, E12).
 */
export type SandboxFailure =
  | "not_found"
  | "no_pod"
  | "no_template"
  | "orchestrator_failed"
  | "conflict"
  | "archived"
  | "owner_limit"
  | "busy"
  | "budget"

/** A project the user can open, listed when the owner limit refuses a new sandbox. */
export interface RunningProject {
  id: string
  name: string
}

/** `message` is the orchestrator's explanation when it gave one; `projects` comes with `owner_limit`. */
export type SandboxResult<T> =
  | { ok: true; data: T }
  | {
      ok: false
      reason: SandboxFailure
      message?: string
      projectIds?: string[]
      projects?: RunningProject[]
    }

export type EnsurePodResult = SandboxResult<EnsurePodResponse>

const SANDBOX_PATH = "/api/v1/sandbox"

function withoutProviderPreviewUrl(data: EnsurePodResponse): EnsurePodResponse {
  if (!data.dev.previewUrl) return data
  const dev = { ...data.dev }
  delete dev.previewUrl
  return { ...data, dev }
}

// Builds the orchestrator URL path for a project's sandbox route.
// Shared by every orchestrator call.
export function podPath(projectId: string, suffix = ""): string {
  return `${SANDBOX_PATH}/${encodeURIComponent(projectId)}${suffix}`
}

// Reads the orchestrator's `{ error }` message (and a capacity refusal's `projectIds`) from a
// failed response body. Only `error` as text: that's what the orchestrator writes for users;
// unexpected errors already arrive as a generic one.
// Always consumes the body so undici can return the connection to the pool.
async function orchestratorDetails(body: {
  json(): Promise<unknown>
  dump(): Promise<void>
}): Promise<{ message?: string; projectIds?: string[]; reason?: string }> {
  try {
    const parsed = (await body.json()) as {
      error?: unknown
      projectIds?: unknown
      reason?: unknown
    }
    const text = parsed.error
    const projectIds = Array.isArray(parsed.projectIds)
      ? parsed.projectIds.filter((id): id is string => typeof id === "string")
      : undefined
    return {
      ...(typeof text === "string" && text.trim() && { message: text.trim() }),
      ...(projectIds && { projectIds }),
      ...(typeof parsed.reason === "string" && { reason: parsed.reason }),
    }
  } catch {
    await body.dump().catch(() => undefined)
    return {}
  }
}

// Converts an orchestrator error status into a SandboxResult failure, logging it.
// 409, 429 and 503 are deliberate refusals (logged as info); anything else is a real failure.
async function failureFrom<T>(
  app: FastifyInstance,
  path: string,
  status: number,
  body: { json(): Promise<unknown>; dump(): Promise<void> },
): Promise<SandboxResult<T>> {
  const details = await orchestratorDetails(body)
  const { message, projectIds } = details

  if (status === 429 || status === 503) {
    const reason =
      status === 429
        ? "owner_limit"
        : details.reason === "budget"
          ? "budget"
          : "busy"
    app.log.info(
      { reqId: currentRequestId(), path, reason },
      "orchestrator has no room for a new sandbox",
    )
    return {
      ok: false,
      reason,
      ...(message && { message }),
      ...(projectIds && { projectIds }),
    }
  }

  if (status === 409) {
    app.log.info(
      { reqId: currentRequestId(), path, message },
      "orchestrator declined the request",
    )
    return { ok: false, reason: "conflict", ...(message && { message }) }
  }

  app.log.error(
    { reqId: currentRequestId(), path, status, message },
    "orchestrator request failed",
  )
  return {
    ok: false,
    reason: "orchestrator_failed",
    ...(message && { message }),
  }
}

// Sends one authenticated request to the orchestrator and normalises the answer, passing on the
// current request id so both services log the same one.
// A 404 always means "no pod"; every response body is consumed so connections are reused.
export async function callOrchestrator<T>(
  app: FastifyInstance,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<SandboxResult<T>> {
  const requestId = currentRequestId()
  const res = await app.orchestrator.request({
    method,
    path,
    headers: {
      authorization: `Bearer ${ENV_CONFIG.ORCHESTRATOR_TOKEN}`,
      ...(requestId && { [REQUEST_ID_HEADER]: requestId }),
      ...(body !== undefined && { "content-type": "application/json" }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

  if (res.statusCode === 404) {
    await res.body.dump()
    return { ok: false, reason: "no_pod" }
  }

  if (res.statusCode >= 400)
    return failureFrom<T>(app, path, res.statusCode, res.body)

  // 204 on a successful write: no body to parse.
  if (res.statusCode === 204) {
    await res.body.dump()
    return { ok: true, data: undefined as T }
  }

  return { ok: true, data: (await res.body.json()) as T }
}

// ---------- RUNTIME RESOLUTION ----------

const templateForSandboxSelect = {
  id: true,
  name: true,
  description: true,
  tag: true,
  version: true,
  imageRef: true,
  devCommand: true,
  devPort: true,
  installCommand: true,
  metadata: true,
} as const

const projectForSandboxSelect = {
  id: true,
  source: true,
  initialPrompt: true,
  templateId: true,
  devCommand: true,
  devPort: true,
  template: { select: templateForSandboxSelect },
  workspace: { select: { userId: true } },
} as const

/** Everything the Start dialog shows, including who set the override. */
const devCommandSelect = {
  ...projectForSandboxSelect,
  devCommandBy: { select: { id: true, name: true } },
} as const

// Loads a project for sandbox work and enforces access in the same query.
// Archived projects are never returned, whatever the access level.
async function loadProject(
  userId: string,
  projectId: string,
  access: "read" | "write",
): Promise<ProjectForSandbox | null> {
  return prisma.project.findFirst({
    where:
      access === "read"
        ? liveProjectFilter(userId, projectId)
        : projectAccessFilter(userId, projectId, access),
    select: projectForSandboxSelect,
  })
}

// Loads the default template used when an origin can't pick one.
// Returns undefined if it hasn't been published yet.
async function defaultTemplate(): Promise<ResolvedTemplate> {
  const fallback = await prisma.template.findUnique({
    where: { name: DEFAULT_TEMPLATE_NAME },
    select: templateForSandboxSelect,
  })
  return fallback ?? undefined
}

// Resolves the image and dev command/port for a project; the project's override beats the template.
// Returns undefined when no usable template (with a run command) exists.
export async function resolveRuntime(
  project: ProjectForSandbox,
): Promise<ProjectRuntime | undefined> {
  const origin = sandboxOriginOf(project)
  const resolved =
    origin === "TEMPLATE"
      ? resolveFromTemplate(project)
      : origin === "REPO"
        ? resolveFromRepo()
        : await resolveFromAgent(project)

  const template = resolved ?? (await defaultTemplate())
  if (!template?.devCommand || template.devPort === null) return undefined

  return {
    templateName: template.name,
    image: template.imageRef,
    templateVersion: template.version,
    devCommand: project.devCommand ?? template.devCommand,
    devPort: project.devPort ?? template.devPort,
    installCommand: template.installCommand,
  }
}

// ---------- ENSURE / RESTART ----------

// Opens or restarts a pod on the image this service chooses (the client never names it).
// Tells an archived project apart from a missing one.
async function openPod(
  app: FastifyInstance,
  userId: string,
  projectId: string,
  access: "read" | "write",
  suffix: "/ensure" | "/restart",
): Promise<{
  result: EnsurePodResult
  project: ProjectForSandbox | null
  runtime?: ProjectRuntime
}> {
  const project = await loadProject(userId, projectId, access)
  if (!project) {
    // Readable but not loadable means it (or its workspace) is archived.
    const archived = await canAccessProject(userId, projectId, "read")
    return {
      result: { ok: false, reason: archived ? "archived" : "not_found" },
      project: null,
    }
  }

  const runtime = await resolveRuntime(project)
  if (!runtime) return { result: { ok: false, reason: "no_template" }, project }

  // Only the image: the dev command and port travel with dev.start over the socket. The owner
  // and their limit decide whether a new sandbox may be created (E7).
  const ownerId = project.workspace.userId
  const result = await callOrchestrator<EnsurePodResponse>(
    app,
    "POST",
    podPath(projectId, suffix),
    {
      templateId: runtime.image,
      templateVersion: runtime.templateVersion,
      ownerId,
      ownerLimit: ENV_CONFIG.OWNER_MAX_SANDBOXES,
      // The project's RUNTIME secrets, for new terminals and the dev server (I1). Sent with every
      // open, so a restarted orchestrator has them again as soon as a tab reconnects.
      secrets: await runtimeSecretsFor(projectId),
    },
  )
  if (!result.ok && result.reason === "owner_limit")
    return {
      result: await explainOwnerLimit(userId, ownerId, result.projectIds ?? []),
      project,
      runtime,
    }
  return { result, project, runtime }
}

// Words the owner-limit refusal for whoever asked, and lists the running projects they can open
// (only those, so another workspace's project names never leak).
async function explainOwnerLimit(
  userId: string,
  ownerId: string,
  projectIds: string[],
): Promise<EnsurePodResult> {
  const projects = projectIds.length
    ? await prisma.project.findMany({
        where: { OR: projectIds.map((id) => liveProjectFilter(userId, id)) },
        select: { id: true, name: true },
      })
    : []
  const count = projectIds.length || ENV_CONFIG.OWNER_MAX_SANDBOXES
  const message =
    userId === ownerId
      ? `You already have ${count} environments running, the most you can have at once. Close one, or wait for an idle one to shut down.`
      : `This workspace's owner already has ${count} environments running, the most they can have at once. Ask them to close one, or wait for an idle one to shut down.`
  return { ok: false, reason: "owner_limit", message, projects }
}

// Opens the project's sandbox or reattaches to it, adding the template name for the greeting.
// Read access is enough: viewers need a sandbox to see Code and Preview.
export async function ensureProjectPod(
  app: FastifyInstance,
  userId: string,
  projectId: string,
): Promise<EnsurePodResult> {
  const { result, runtime } = await openPod(
    app,
    userId,
    projectId,
    "read",
    "/ensure",
  )
  const templateName = runtime?.templateName
  if (!result.ok) return result
  return {
    ok: true,
    data: withoutProviderPreviewUrl({
      ...result.data,
      ...(templateName && { templateName }),
    }),
  }
}

// Opens the project's sandbox for an agent run. Unlike a viewing tab, the worker is about to
// mutate files, so the requesting actor must still have write access.
export async function ensureProjectPodForAgent(
  app: FastifyInstance,
  userId: string,
  projectId: string,
): Promise<EnsurePodResult> {
  const { result, runtime } = await openPod(
    app,
    userId,
    projectId,
    "write",
    "/ensure",
  )
  const templateName = runtime?.templateName
  if (!result.ok) return result
  return {
    ok: true,
    data: withoutProviderPreviewUrl({
      ...result.data,
      ...(templateName && { templateName }),
    }),
  }
}

// Replaces the sandbox with a fresh one restored from its saved work.
// Destructive, so editors and the owner only.
export async function restartProjectPod(
  app: FastifyInstance,
  userId: string,
  projectId: string,
): Promise<EnsurePodResult> {
  const { result } = await openPod(app, userId, projectId, "write", "/restart")
  return result.ok
    ? { ok: true, data: withoutProviderPreviewUrl(result.data) }
    : result
}

// Sends the project's current RUNTIME secrets to the orchestrator after one is added, changed or
// deleted (I1). Never throws: if it fails, the next open (every tab reconnect) sends them again.
export async function pushProjectSecrets(
  app: FastifyInstance,
  projectId: string,
): Promise<void> {
  try {
    const result = await callOrchestrator<void>(
      app,
      "PUT",
      podPath(projectId, "/secrets"),
      { secrets: await runtimeSecretsFor(projectId) },
    )
    if (!result.ok)
      app.log.warn(
        { projectId, reason: result.reason },
        "could not send the project's secrets to the orchestrator; the next open will",
      )
  } catch (error) {
    app.log.warn(
      { projectId, err: error },
      "could not send the project's secrets to the orchestrator; the next open will",
    )
  }
}

// Returns the project's current pod, if any.
// `no_pod` is the normal answer for a project nobody has opened.
export async function getProjectPod(
  app: FastifyInstance,
  userId: string,
  projectId: string,
): Promise<SandboxResult<PodRecord>> {
  if (!(await canAccessLiveProject(userId, projectId)))
    return { ok: false, reason: "not_found" }
  return callOrchestrator<PodRecord>(app, "GET", podPath(projectId))
}

// Shuts down a project's sandbox on archive (`save: true`) or delete (`save: false`).
// Never throws: the archive/delete still succeeds and the reaper handles anything left running.
export async function releaseProjectPod(
  app: FastifyInstance,
  projectId: string,
  { save }: { save: boolean },
): Promise<boolean> {
  try {
    const path = save ? `${podPath(projectId)}?save=true` : podPath(projectId)
    const result = await callOrchestrator<void>(app, "DELETE", path)
    // `no_pod` just means it never had one.
    if (!result.ok && result.reason !== "no_pod") {
      app.log.error(
        { projectId, save },
        save
          ? "could not save and shut down the project's sandbox; it is left running for the reaper to save and stop"
          : "could not shut down the project's sandbox; it may still be running",
      )
    }
    return result.ok
  } catch (error) {
    app.log.error(
      { err: error, projectId },
      "sandbox service unreachable while releasing a pod",
    )
    return false
  }
}

// ---------- FILES ----------

// Lists a project folder via the orchestrator (plain HTTP, since a listing is request/response).
// Open to viewers.
export async function listProjectFiles(
  app: FastifyInstance,
  userId: string,
  projectId: string,
  input: ListPodFilesQuery,
): Promise<SandboxResult<PodFileListing>> {
  if (!(await canAccessLiveProject(userId, projectId)))
    return { ok: false, reason: "not_found" }

  const query = new URLSearchParams({ depth: String(input.depth) })
  if (input.path) query.set("path", input.path)

  return callOrchestrator<PodFileListing>(
    app,
    "GET",
    `${podPath(projectId, "/fs/list")}?${query.toString()}`,
  )
}

// Reads one project file via the orchestrator.
// Open to viewers.
export async function readProjectFile(
  app: FastifyInstance,
  userId: string,
  projectId: string,
  path: string,
): Promise<SandboxResult<{ content: string }>> {
  if (!(await canAccessLiveProject(userId, projectId)))
    return { ok: false, reason: "not_found" }

  const query = new URLSearchParams({ path }).toString()
  return callOrchestrator<{ content: string }>(
    app,
    "GET",
    `${podPath(projectId, "/fs")}?${query}`,
  )
}

// Writes one project file via the orchestrator.
// Editors and the owner only.
export async function writeProjectFile(
  app: FastifyInstance,
  userId: string,
  projectId: string,
  input: WritePodFileDataType,
): Promise<SandboxResult<void>> {
  if (!(await canAccessProject(userId, projectId, "write")))
    return { ok: false, reason: "not_found" }
  return callOrchestrator<void>(app, "PUT", podPath(projectId, "/fs"), input)
}

// ---------- THE RUN COMMAND ----------

// Loads a project with its dev-command fields, enforcing access.
// Shared by the dev-command read, save and reset paths.
async function loadForDevCommand(
  userId: string,
  projectId: string,
  access: "read" | "write",
) {
  return prisma.project.findFirst({
    where:
      access === "read"
        ? liveProjectFilter(userId, projectId)
        : projectAccessFilter(userId, projectId, access),
    select: devCommandSelect,
  })
}

// Builds the Start dialog's settings: what will run, whether it's an override, and the template default.
// Resolves twice (with and without the override) so the client needn't know the rule.
async function settingsFor(
  project: NonNullable<Awaited<ReturnType<typeof loadForDevCommand>>>,
): Promise<SandboxResult<DevCommandSettings>> {
  const runtime = await resolveRuntime(project)
  if (!runtime) return { ok: false, reason: "no_template" }

  const fallback = await resolveRuntime({
    ...project,
    devCommand: null,
    devPort: null,
  })
  if (!fallback) return { ok: false, reason: "no_template" }

  return {
    ok: true,
    data: {
      devCommand: runtime.devCommand,
      devPort: runtime.devPort,
      isOverride: project.devCommand !== null || project.devPort !== null,
      changedBy: project.devCommandBy,
      templateDefault: {
        devCommand: fallback.devCommand,
        devPort: fallback.devPort,
      },
      installCommand: runtime.installCommand,
    },
  }
}

// Returns the project's current dev command settings.
// Viewers may read it to understand the preview they're watching.
export async function getProjectDevCommand(
  userId: string,
  projectId: string,
): Promise<SandboxResult<DevCommandSettings>> {
  const project = await loadForDevCommand(userId, projectId, "read")
  if (!project) return { ok: false, reason: "not_found" }
  return settingsFor(project)
}

// Saves a deliberately chosen command+port for everyone on the project.
// Unchanged input writes nothing; matching the template default clears the override instead.
export async function setProjectDevCommand(
  userId: string,
  projectId: string,
  input: { command: string; port: number },
): Promise<SandboxResult<DevCommandSettings>> {
  const project = await loadForDevCommand(userId, projectId, "write")
  if (!project) return { ok: false, reason: "not_found" }

  const current = await settingsFor(project)
  if (!current.ok) return current

  const unchanged =
    input.command === current.data.devCommand &&
    input.port === current.data.devPort
  if (unchanged) return current

  // Back to the template default is a reset, so future template fixes still apply.
  const { templateDefault } = current.data
  const isDefault =
    input.command === templateDefault.devCommand &&
    input.port === templateDefault.devPort

  await prisma.project.update({
    where: { id: projectId },
    data: isDefault
      ? { devCommand: null, devPort: null, devCommandById: null }
      : {
          devCommand: input.command,
          devPort: input.port,
          devCommandById: userId,
        },
  })

  return announce(projectId, userId)
}

// Re-reads the dev command settings and broadcasts them to every open tab.
// Otherwise the next person to press Start might run a command they never saw.
async function announce(
  projectId: string,
  userId: string,
): Promise<SandboxResult<DevCommandSettings>> {
  const updated = await loadForDevCommand(userId, projectId, "write")
  if (!updated) return { ok: false, reason: "not_found" }

  const settings = await settingsFor(updated)
  if (settings.ok)
    publishProjectEvent({
      type: "devCommand.updated",
      projectId,
      settings: settings.data,
    })
  return settings
}

// Clears the project's override so it follows the template (and its future fixes) again.
// Editors and the owner only.
export async function resetProjectDevCommand(
  userId: string,
  projectId: string,
): Promise<SandboxResult<DevCommandSettings>> {
  const project = await loadForDevCommand(userId, projectId, "write")
  if (!project) return { ok: false, reason: "not_found" }

  await prisma.project.update({
    where: { id: projectId },
    data: { devCommand: null, devPort: null, devCommandById: null },
  })

  return announce(projectId, userId)
}
