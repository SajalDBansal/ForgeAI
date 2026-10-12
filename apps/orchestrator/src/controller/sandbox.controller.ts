import {
  agentCheckpointSchema,
  agentCheckpointDiffSchema,
  agentCheckpointRestoreSchema,
  agentDevStartSchema,
  agentDevStopSchema,
  agentEditFileSchema,
  agentExecSchema,
  agentSearchQuerySchema,
  restoreCommitSchema,
  gitCheckSchema,
  gitCommitSchema,
  gitPrepareSchema,
  gitResolveSchema,
  gitRestoreFileSchema,
  gitRollbackSchema,
  ensurePodSchema,
  setPodSecretsSchema,
  listPodFilesQuerySchema,
  readPodFileQuerySchema,
  writePodFileSchema,
} from "@forgeAI/shared"
import { FileNotFoundError } from "@forgeAI/sandbox-provider"
import type { FastifyReply, FastifyRequest } from "fastify"
import {
  destroyPod,
  ensurePod,
  getPodStatus,
  restartPod,
} from "../service/sandbox.service.js"
import {
  listProjectFiles,
  readPodFile,
  writePodFile,
} from "../service/file.service.js"
import { restoreCommit } from "../service/commit.service.js"
import {
  checkGit,
  commitGit,
  prepareGit,
  resolveGit,
  restoreFileGit,
  rollbackGit,
  type GitOutcome,
} from "../service/git.service.js"
import { editorReadRefusal } from "../lib/file-limits.js"
import {
  asCapacityError,
  type SandboxOwner,
} from "../service/capacity.service.js"
import { setProjectSecrets } from "../state.js"
import {
  projectLeaseToken,
  requireCurrentProjectLease,
} from "../lib/agent-lease.js"
import { ragSource } from "../service/rag-source.service.js"
import {
  agentCheckpoint,
  agentCheckpointDiff,
  agentCheckpointRestore,
  agentEditFile,
  agentExec,
  agentSearch,
} from "../service/agent.service.js"
import {
  getDevServerStatus,
  readDevServerForAgent,
  startDevServerForAgent,
  stopDevServerForAgent,
} from "../service/dev.service.js"

// Reads the projectId route param.
// Every sandbox route is keyed by it.
function projectIdOf(request: FastifyRequest): string {
  return (request.params as { projectId: string }).projectId
}

// Picks the first validation message from a failed zod parse.
// Used to answer 400s with one readable reason.
function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Invalid request"
}

// Sends a 400 with the given message.
// Used when a request body or query fails validation.
function badRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({ error: message })
}

// Sends a 404 meaning this project has no sandbox (or no such path).
// Shared by every handler that needs a live pod.
function notFound(reply: FastifyReply) {
  return reply.status(404).send({ error: "No sandbox for this project" })
}

// Builds the owner a new sandbox counts against from the request (api-server always sends both).
function ownerOf(
  ownerId: string | undefined,
  ownerLimit: number | undefined,
): SandboxOwner | undefined {
  return ownerId && ownerLimit ? { id: ownerId, limit: ownerLimit } : undefined
}

async function requireAgentLease(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  return requireCurrentProjectLease(request, reply, projectIdOf(request))
}

async function rejectStaleAgentLeaseWhenPresent(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  if (!projectLeaseToken(request)) return true
  return requireAgentLease(request, reply)
}

// Answers a capacity refusal: 429 for the owner limit, 503 for "busy" (with Retry-After) and for
// the daily budget (E7, E9, E12). Anything else is a real error and goes on to the error handler.
function refuseForCapacity(reply: FastifyReply, error: unknown) {
  const capacity = asCapacityError(error)
  if (!capacity) throw error
  if (capacity.refusal.reason === "busy") reply.header("retry-after", "30")
  return reply.status(capacity.status).send(capacity.refusal)
}

// Opens (or reattaches to) the project's sandbox and returns its record.
// Called whenever someone opens a project.
export async function ensurePodHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = ensurePodSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))

  const { templateId, templateVersion, ownerId, ownerLimit, secrets } =
    parsed.data
  // The project's secrets come with every open, so a restarted orchestrator has them again (I1).
  if (secrets) setProjectSecrets(projectIdOf(request), secrets)
  try {
    return reply.send(
      await ensurePod(
        projectIdOf(request),
        templateId,
        templateVersion,
        ownerOf(ownerId, ownerLimit),
      ),
    )
  } catch (error) {
    return refuseForCapacity(reply, error)
  }
}

// PUT /:projectId/secrets: replaces the project's secrets with the current set (I1).
// api-server sends it whenever a secret is added, changed or deleted; new terminals and the next
// dev-server start use it. Kept in memory only.
export async function setPodSecretsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = setPodSecretsSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))
  setProjectSecrets(projectIdOf(request), parsed.data.secrets)
  return reply.status(204).send()
}

// POST /:projectId/rag-source: a link to the project's current source, for the knowledge graph (Q5).
// Saves first only if something changed; 404 when the project has no sandbox.
export async function ragSourceHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!(await rejectStaleAgentLeaseWhenPresent(request, reply))) return
  const result = await ragSource(projectIdOf(request))
  if (result.ok) return reply.send(result.source)
  if (result.reason === "no_pod") return notFound(reply)
  return reply.status(502).send({ error: result.reason, detail: result.detail })
}

// Returns the in-memory record of the project's sandbox.
// Lets api-server check pod status without opening one.
export async function getPodHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const pod = getPodStatus(projectIdOf(request))
  if (!pod) return notFound(reply)
  return reply.send(pod)
}

// Returns the current dev-server status without opening a sandbox.
// api-server uses this to proxy previews only when a server is actually live.
export async function getDevStatusHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const projectId = projectIdOf(request)
  if (!getPodStatus(projectId)) return notFound(reply)
  return reply.send(getDevServerStatus(projectId))
}

// Saves, replaces and restores the project's sandbox.
// Backs the "Restart environment" action.
export async function restartPodHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = ensurePodSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))

  const { templateId, templateVersion, ownerId, ownerLimit, secrets } =
    parsed.data
  if (secrets) setProjectSecrets(projectIdOf(request), secrets)
  try {
    return reply.send(
      await restartPod(
        projectIdOf(request),
        templateId,
        templateVersion,
        ownerOf(ownerId, ownerLimit),
      ),
    )
  } catch (error) {
    return refuseForCapacity(reply, error)
  }
}

// Kills the project's sandbox; `?save=true` snapshots it first.
// Used by archive (save) and delete (no save).
export async function destroyPodHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { save } = request.query as { save?: string }

  const outcome = await destroyPod(projectIdOf(request), {
    save: save === "true",
  })
  if (outcome === "no_pod") return notFound(reply)
  if (outcome === "kept_unsaved") {
    return reply.status(409).send({
      error:
        "The sandbox's work could not be saved, so it was kept running; it will be saved and shut down automatically.",
    })
  }
  return reply.status(204).send()
}

// Reads one file from the project's sandbox.
// Backs the code editor's file loading.
export async function readPodFileHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = readPodFileQuerySchema.safeParse(request.query)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))

  let content: string | undefined
  try {
    content = await readPodFile(projectIdOf(request), parsed.data.path)
  } catch (error) {
    if (error instanceof FileNotFoundError) return notFound(reply)
    // A deliberate refusal, so 409: api-server passes the message through to the file panel.
    const refusal = editorReadRefusal(error)
    if (refusal) return reply.status(409).send({ error: refusal })
    throw error
  }
  if (content === undefined) return notFound(reply)
  return reply.send({ content })
}

// Writes one file into the project's sandbox.
// Backs direct file saves from the API.
export async function writePodFileHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = writePodFileSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))

  const wrote = await writePodFile(
    projectIdOf(request),
    parsed.data.path,
    parsed.data.content,
  )
  if (!wrote) return notFound(reply)
  return reply.status(204).send()
}

// Sends a git outcome: refusals are 200 with `ok: false`, not errors.
// Lets api-server read exactly what happened instead of guessing from a status code.
function sendGit<T>(reply: FastifyReply, outcome: GitOutcome<T>) {
  if (outcome.ok) return reply.send({ ok: true, ...outcome.data })
  if ("refusal" in outcome)
    return reply.send({ ok: false, refusal: outcome.refusal })
  if (outcome.reason === "no_pod") return notFound(reply)
  return reply.status(500).send({ error: `git failed: ${outcome.detail}` })
}

// Sends an agent tool outcome. Input problems are 409s; missing sandbox or file is 404.
function sendAgentTool<T>(
  reply: FastifyReply,
  outcome:
    | { ok: true; data: T }
    | {
        ok: false
        reason:
          "no_pod" | "not_found" | "failed" | "conflict" | "search_missing"
        detail?: string
      },
) {
  if (outcome.ok) return reply.send(outcome.data)
  if (outcome.reason === "no_pod" || outcome.reason === "not_found")
    return notFound(reply)
  if (outcome.reason === "conflict" || outcome.reason === "search_missing") {
    return reply.status(409).send({ error: outcome.detail ?? outcome.reason })
  }
  return reply
    .status(502)
    .send({ error: outcome.detail ?? "Agent tool failed" })
}

// Runs a non-interactive command for the agent and publishes capped output to agent-events.
export async function agentExecHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = agentExecSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))
  if (!(await requireAgentLease(request, reply))) return

  const abort = new AbortController()
  request.raw.on("aborted", () => abort.abort())
  return sendAgentTool(
    reply,
    await agentExec(projectIdOf(request), parsed.data, abort.signal),
  )
}

// Edits a file for the agent. If the file is open, the change goes through the shared Yjs document.
export async function agentEditFileHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = agentEditFileSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))
  if (!(await requireAgentLease(request, reply))) return

  try {
    return sendAgentTool(
      reply,
      await agentEditFile(projectIdOf(request), parsed.data),
    )
  } catch (error) {
    const refusal = editorReadRefusal(error)
    if (refusal) return reply.status(409).send({ error: refusal })
    throw error
  }
}

// Searches the project sandbox with ripgrep for the agent.
export async function agentSearchHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = agentSearchQuerySchema.safeParse(request.query)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))
  return sendAgentTool(
    reply,
    await agentSearch(projectIdOf(request), parsed.data),
  )
}

// Creates a local-only git checkpoint in the sandbox and returns its commit id.
export async function agentCheckpointHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = agentCheckpointSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))
  if (!(await requireAgentLease(request, reply))) return
  return sendAgentTool(
    reply,
    await agentCheckpoint(projectIdOf(request), parsed.data),
  )
}

export async function agentCheckpointDiffHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = agentCheckpointDiffSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))
  if (!(await requireAgentLease(request, reply))) return
  return sendAgentTool(
    reply,
    await agentCheckpointDiff(projectIdOf(request), parsed.data),
  )
}

export async function agentCheckpointRestoreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = agentCheckpointRestoreSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))
  return sendAgentTool(
    reply,
    await agentCheckpointRestore(projectIdOf(request), parsed.data),
  )
}

// Starts the shared preview server for the agent.
export async function agentDevStartHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = agentDevStartSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))
  if (!(await requireAgentLease(request, reply))) return

  const outcome = await startDevServerForAgent(
    projectIdOf(request),
    parsed.data,
  )
  if (outcome.ok) return reply.send(outcome.data)
  return notFound(reply)
}

// Stops the shared preview server for the agent.
export async function agentDevStopHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = agentDevStopSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))
  if (!(await requireAgentLease(request, reply))) return

  const outcome = await stopDevServerForAgent(projectIdOf(request))
  if (outcome.ok) return reply.send(outcome.data)
  return notFound(reply)
}

// Reads the shared preview server's current status and recent logs.
export async function agentDevLogsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const outcome = readDevServerForAgent(projectIdOf(request))
  if (outcome.ok) return reply.send(outcome.data)
  return notFound(reply)
}

// Builds token-free Git state from GitHub and reports where GitHub stands.
// Called when a project opens, before any commit.
export async function gitPrepareHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = gitPrepareSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))
  return sendGit(
    reply,
    await prepareGit(projectIdOf(request), parsed.data.remote),
  )
}

// Commits the project and pushes it to GitHub.
// Backs the Commit dialog.
export async function gitCommitHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = gitCommitSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))
  const { remote, message, author } = parsed.data
  return sendGit(
    reply,
    await commitGit(projectIdOf(request), remote, message, author),
  )
}

// Restores one commit's files and commits that as a new entry.
// Backs "Roll back to this version" in History.
export async function gitRollbackHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = gitRollbackSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))
  const { remote, sha, message, author } = parsed.data
  return sendGit(
    reply,
    await rollbackGit(projectIdOf(request), remote, sha, message, author),
  )
}

// Reports where GitHub stands and what a shift would clash with. Changes nothing.
// Feeds the "GitHub has new commits" popup.
export async function gitCheckHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = gitCheckSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))
  return sendGit(
    reply,
    await checkGit(projectIdOf(request), parsed.data.remote),
  )
}

// Resolves a GitHub shift the way the person chose (theirs, merge or mine).
// Backs the shift popup's resolve button.
export async function gitResolveHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = gitResolveSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))
  const { remote, choice, expectHead, picks, author, message } = parsed.data
  if (!author) return badRequest(reply, "author is required")
  if (choice === "mine" && !message)
    return badRequest(reply, "message is required to keep this version")
  return sendGit(
    reply,
    await resolveGit(
      projectIdOf(request),
      remote,
      choice,
      expectHead,
      picks,
      author,
      message,
    ),
  )
}

// Restores one file from a shift's backup.
// Backs "Restore my version" after GitHub's changes replaced a file.
export async function gitRestoreFileHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = gitRestoreFileSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))
  return sendGit(
    reply,
    await restoreFileGit(
      projectIdOf(request),
      parsed.data.backup,
      parsed.data.path,
    ),
  )
}

// Puts a legacy commit's files back into the sandbox; api-server then commits the result.
// First half of rolling back to a pre-GitHub version.
export async function restoreCommitHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = restoreCommitSchema.safeParse(request.body)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))

  const result = await restoreCommit(projectIdOf(request), parsed.data.commitId)
  if (result.ok) return reply.status(204).send()
  if (result.reason === "no_pod") return notFound(reply)
  return reply
    .status(500)
    .send({ error: result.detail ?? "Couldn't restore that commit" })
}

// Lists a folder in the project's sandbox.
// Backs the file tree; a missing pod and a missing folder both return 404.
export async function listPodFilesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = listPodFilesQuerySchema.safeParse(request.query)
  if (!parsed.success) return badRequest(reply, firstIssue(parsed.error))

  const listing = await listProjectFiles(
    projectIdOf(request),
    parsed.data.path,
    parsed.data.depth,
  )
  if (!listing) return notFound(reply)
  return reply.send(listing)
}
