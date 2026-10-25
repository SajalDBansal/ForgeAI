import {
  commitProjectSchema,
  resolveShiftSchema,
  restoreShiftFileSchema,
  listPodFilesQuerySchema,
  readPodFileQuerySchema,
  setDevCommandSchema,
  writePodFileSchema,
  type GitRefusal,
  openSandboxForAgentSchema,
} from "@forgeAI/shared"
import type { FastifyReply, FastifyRequest } from "fastify"
import { prisma } from "@forgeAI/database"
import { enqueueTask } from "@forgeAI/jobs"
import { firstIssue, sendResult, type HttpResult } from "../lib/http.js"
import { withIdempotency } from "../lib/idempotency.js"
import { RATE_LIMITS, withinLimit } from "../lib/rate-limit.js"
import { requireSession } from "../lib/session.js"
import {
  commitProject,
  connectProjectToGithub,
  githubStatus,
  resolveShift,
  restoreShiftFile,
  rollbackProject,
  type GitVcResult,
} from "../service/git-vc.service.js"
import {
  ensureProjectPod,
  ensureProjectPodForAgent,
  getProjectDevCommand,
  getProjectPod,
  listProjectFiles,
  readProjectFile,
  resetProjectDevCommand,
  restartProjectPod,
  setProjectDevCommand,
  writeProjectFile,
  type RunningProject,
  type SandboxFailure,
} from "../service/sandbox.service.js"

interface ProjectParams {
  id: string
}

interface CommitParams extends ProjectParams {
  commitId: string
}

// Describes a sandbox failure as one consistent HTTP answer.
// `not_found` covers both "missing" and "not yours" so projects can't be probed.
function failure(
  reason: SandboxFailure,
  message?: string,
  projects?: RunningProject[],
): HttpResult {
  switch (reason) {
    case "not_found":
      return { status: 404, body: { error: "Project not found" } }
    case "no_pod":
      return { status: 404, body: { error: "This project has no sandbox yet" } }
    case "no_template":
      return {
        status: 500,
        body: { error: "No template is published to build a sandbox from" },
      }
    case "archived":
      return {
        status: 409,
        body: {
          error: "This project is archived. Restore it to work on it again.",
        },
      }
    case "conflict":
      return {
        status: 409,
        body: {
          error: message ?? "The sandbox service declined this request.",
        },
      }
    case "orchestrator_failed":
      // Prefer the orchestrator's own explanation (e.g. why a restart was refused).
      return {
        status: 502,
        body: {
          error: message ?? "Couldn't reach the sandbox service. Try again.",
        },
      }
    case "owner_limit":
      // The builder lists `projects` so one can be closed (E15).
      return {
        status: 429,
        body: {
          error: message ?? "Too many environments are running.",
          code: "OWNER_LIMIT",
          projects: projects ?? [],
        },
      }
    case "budget":
      // Retrying won't help until tomorrow, so no Retry-After; the builder shows the message.
      return {
        status: 503,
        body: {
          error: message ?? "New environments are paused until tomorrow.",
          code: "BUDGET_PAUSED",
        },
      }
    case "busy":
      // The builder waits and retries by itself (E15).
      return {
        status: 503,
        headers: { "retry-after": "30" },
        body: {
          error:
            message ??
            "All environments are busy right now. We'll keep trying.",
          code: "SANDBOX_BUSY",
        },
      }
  }
}

// Sends a sandbox failure on the reply.
// Used by the handlers that answer straight away.
function fail(
  reply: FastifyReply,
  reason: SandboxFailure,
  message?: string,
  projects?: RunningProject[],
) {
  return sendResult(reply, failure(reason, message, projects))
}

// Explains why committing is paused after GitHub moved or rejected the push.
// Distinguishes a rewritten history from someone simply pushing on top.
function pausedMessage(
  refusal: Extract<GitRefusal, { reason: "shift" | "rejected" }>,
): string {
  return refusal.reason === "shift" && refusal.shift.kind === "rewritten"
    ? "This project's GitHub history was rewritten since its last commit, so committing is paused. Nothing was changed."
    : "Someone pushed to this project's GitHub repository since its last commit, so committing is paused until those changes are brought in. Nothing was changed."
}

// Describes a git refusal as a human-readable HTTP answer.
// `rollback` tweaks the "unchanged" wording for rollbacks.
function refusalResult(refusal: GitRefusal, rollback: boolean): HttpResult {
  switch (refusal.reason) {
    case "unchanged":
      return {
        status: 409,
        body: {
          error: rollback
            ? "The project already matches that commit"
            : "Nothing has changed since your last commit",
        },
      }
    case "shift":
    case "rejected":
      return { status: 409, body: { error: pausedMessage(refusal), refusal } }
    case "unreachable":
      return {
        status: 502,
        body: {
          error: "GitHub couldn't be reached — your work is safe. Try again.",
          refusal,
        },
      }
    case "too_large":
      return {
        status: 409,
        body: {
          error: `GitHub doesn't accept files over 100 MB: ${refusal.files.join(", ")}. Remove them, or add them to .gitignore.`,
          refusal,
        },
      }
    case "no_git":
      return {
        status: 500,
        body: {
          error:
            "This project's sandbox has no git installed, so it can't commit.",
        },
      }
    case "unknown_commit":
      return {
        status: 404,
        body: {
          error: "That commit isn't in the project's GitHub history any more.",
        },
      }
    case "privileged_busy":
      return {
        status: 409,
        body: {
          error:
            "GitHub versioning is paused while runtime, terminal or agent work is active. Stop the preview, close the shared terminal and wait for agent work to finish, then try again.",
          refusal,
        },
      }
    case "moved":
      return {
        status: 409,
        body: {
          error:
            "GitHub changed again while you were deciding — have another look.",
          refusal,
        },
      }
  }
  return { status: 409, body: { error: "Git refused this", refusal } }
}

// Describes every commit/rollback/shift failure as the answer the person sees.
// Falls back to `failure` for sandbox-level reasons.
function gitFailure(
  result: Exclude<GitVcResult, { ok: true }>,
  rollback = false,
): HttpResult {
  switch (result.reason) {
    case "no_github":
      return {
        status: 409,
        body: {
          error:
            "Put this project on GitHub to save versions of it — use the GitHub button at the top of the page.",
        },
      }
    case "busy":
      return {
        status: 409,
        body: {
          error:
            "A commit of this project is already in progress. Try again in a moment.",
        },
      }
    case "no_commit":
      return { status: 404, body: { error: "Commit not found" } }
    case "imported":
      return {
        status: 409,
        body: {
          error:
            "This project's repository was imported, and ForgeAI doesn't write to it.",
        },
      }
    case "already":
      return {
        status: 409,
        body: {
          error:
            "This project is already on GitHub — every commit is pushed there.",
        },
      }
    case "github":
      return {
        status: 502,
        body: {
          error: `GitHub couldn't be reached — your work is safe. Try again. (${result.message})`,
        },
      }
    case "no_pod":
      return {
        status: 409,
        body: {
          error: "Open the project first — commits are made in its sandbox.",
        },
      }
    case "refused":
      return refusalResult(result.refusal, rollback)
    default:
      return failure(
        result.reason,
        "message" in result ? result.message : undefined,
      )
  }
}

// Sends a git failure on the reply.
// Used by the handlers that answer straight away.
function failGit(
  reply: FastifyReply,
  result: Exclude<GitVcResult, { ok: true }>,
  rollback = false,
) {
  return sendResult(reply, gitFailure(result, rollback))
}

// POST /project/:id/sandbox: opens (or reattaches to) the project's sandbox.
// Called when the builder opens; git is prepared in the background afterwards.
export async function ensureProjectPodHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  if (
    !(await withinLimit(
      reply,
      RATE_LIMITS.sandbox,
      `${session.user.id}:${request.params.id}`,
    ))
  )
    return

  const result = await ensureProjectPod(
    request.server,
    session.user.id,
    request.params.id,
  )
  if (!result.ok)
    return fail(reply, result.reason, result.message, result.projects)
  await enqueueTask(prisma, {
    type: "github.prepare",
    projectId: request.params.id,
    actorId: session.user.id,
  })
  return result.data
}

// POST /internal/agent/projects/:id/sandbox: the agent worker opens a run's sandbox (I5b, option A).
// Opens as the person who asked. Agent work requires their current write access; the template,
// owner's limit, capacity and project secrets all stay enforced inside api-server.
export async function openSandboxForAgentHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const parsed = openSandboxForAgentSchema.safeParse(request.body)
  if (!parsed.success)
    return reply.status(400).send({ error: firstIssue(parsed.error) })

  const result = await ensureProjectPodForAgent(
    request.server,
    parsed.data.userId,
    request.params.id,
  )
  if (!result.ok)
    return fail(reply, result.reason, result.message, result.projects)
  await enqueueTask(prisma, {
    type: "github.prepare",
    projectId: request.params.id,
    actorId: parsed.data.userId,
  })
  return result.data
}

// ---------- WHEN GITHUB MOVED ----------

// GET /project/:id/github/status: whether GitHub moved since ForgeAI's last commit, and how.
// Open to anyone on the project; `?fresh=1` skips the cache.
export async function githubStatusHandler(
  request: FastifyRequest<{
    Params: ProjectParams
    Querystring: { fresh?: string }
  }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  const status = await githubStatus(
    request.server,
    session.user.id,
    request.params.id,
    request.query.fresh === "1",
  )
  return status ?? reply.status(404).send({ error: "Project not found" })
}

// POST /project/:id/github/resolve: takes GitHub's changes or keeps this version.
// Editors may take GitHub's; only the owner may keep theirs.
export async function resolveShiftHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  if (!(await withinLimit(reply, RATE_LIMITS.git, session.user.id))) return
  const parsed = resolveShiftSchema.safeParse(request.body)
  if (!parsed.success)
    return reply.status(400).send({ error: firstIssue(parsed.error) })

  const { choice, expectHead, picks } = parsed.data
  const result = await resolveShift(
    request.server,
    session.user.id,
    request.params.id,
    choice,
    expectHead,
    picks,
  )
  if (result.ok) return result.data
  if (result.reason === "not_found" && choice === "mine") {
    return reply.status(403).send({
      error: "Only the workspace owner can keep this version over GitHub's.",
    })
  }
  return failGit(reply, result)
}

// POST /project/:id/github/restore-file: restores one file GitHub's changes replaced.
// Backs "Restore my version" after resolving a shift.
export async function restoreShiftFileHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  const parsed = restoreShiftFileSchema.safeParse(request.body)
  if (!parsed.success)
    return reply.status(400).send({ error: firstIssue(parsed.error) })

  const result = await restoreShiftFile(
    request.server,
    session.user.id,
    request.params.id,
    parsed.data.backup,
    parsed.data.path,
  )
  if (result.ok) return reply.status(204).send()
  if (result.reason === "not_found")
    return reply.status(404).send({ error: "Project not found" })
  if (result.reason === "refused")
    return reply.status(404).send({ error: result.message })
  return fail(reply, result.reason, result.message)
}

// GET /project/:id/sandbox: returns the project's current pod record.
// Lets the client check status without opening a sandbox.
export async function getProjectPodHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await getProjectPod(
    request.server,
    session.user.id,
    request.params.id,
  )
  return result.ok ? result.data : fail(reply, result.reason, result.message)
}

// POST /project/:id/sandbox/restart: saves, replaces and restores the sandbox.
// Backs "Restart environment".
export async function restartProjectPodHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  if (
    !(await withinLimit(
      reply,
      RATE_LIMITS.sandbox,
      `${session.user.id}:${request.params.id}`,
    ))
  )
    return

  const result = await restartProjectPod(
    request.server,
    session.user.id,
    request.params.id,
  )
  return result.ok
    ? result.data
    : fail(reply, result.reason, result.message, result.projects)
}

// GET /project/:id/sandbox/fs: reads one project file.
// Open to viewers.
export async function readProjectFileHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const parsed = readPodFileQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }

  const result = await readProjectFile(
    request.server,
    session.user.id,
    request.params.id,
    parsed.data.path,
  )
  return result.ok ? result.data : fail(reply, result.reason, result.message)
}

// PUT /project/:id/sandbox/fs: writes one project file.
// Editors and the owner only.
export async function writeProjectFileHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const parsed = writePodFileSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }

  const result = await writeProjectFile(
    request.server,
    session.user.id,
    request.params.id,
    parsed.data,
  )
  if (!result.ok) return fail(reply, result.reason, result.message)
  return reply.status(204).send()
}

// ---------- THE RUN COMMAND ----------
// Saving the command is durable (HTTP here); running it is a live stream (socket to the orchestrator).

// GET /project/:id/sandbox/dev-command: the resolved dev command and where it came from.
// Read right before the Start dialog opens so it reflects collaborators' changes.
export async function getProjectDevCommandHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await getProjectDevCommand(session.user.id, request.params.id)
  return result.ok ? result.data : fail(reply, result.reason, result.message)
}

// PUT /project/:id/sandbox/dev-command: saves a project-level dev command override.
// Editors and the owner only.
export async function setProjectDevCommandHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const parsed = setDevCommandSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }

  const result = await setProjectDevCommand(
    session.user.id,
    request.params.id,
    parsed.data,
  )
  return result.ok ? result.data : fail(reply, result.reason, result.message)
}

// DELETE /project/:id/sandbox/dev-command: clears the override ("Reset to template default").
// A separate verb because opting back in to template updates is a different intent.
export async function resetProjectDevCommandHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await resetProjectDevCommand(
    session.user.id,
    request.params.id,
  )
  return result.ok ? result.data : fail(reply, result.reason, result.message)
}

// ---------- COMMITS ----------

// POST /project/:id/commits: commits the project to GitHub and adds it to History.
// Viewers get the same 404 as strangers. An Idempotency-Key stops a retried request
// from pushing the same commit twice.
export async function commitProjectHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  if (!(await withinLimit(reply, RATE_LIMITS.git, session.user.id))) return

  const parsed = commitProjectSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }

  await withIdempotency(
    reply,
    session.user.id,
    request.headers["idempotency-key"],
    async () => {
      const result = await commitProject(
        request.server,
        session.user.id,
        request.params.id,
        parsed.data.message,
      )
      return result.ok ? { status: 200, body: result.data } : gitFailure(result)
    },
  )
}

// POST /project/:id/commits/:commitId/rollback: restores a commit's files as a new commit.
// Owner only. An Idempotency-Key stops a retried request from rolling back twice.
export async function rollbackProjectHandler(
  request: FastifyRequest<{ Params: CommitParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  if (!(await withinLimit(reply, RATE_LIMITS.git, session.user.id))) return

  await withIdempotency(
    reply,
    session.user.id,
    request.headers["idempotency-key"],
    async () => {
      const result = await rollbackProject(
        request.server,
        session.user.id,
        request.params.id,
        request.params.commitId,
      )
      return result.ok
        ? { status: 200, body: result.data }
        : gitFailure(result, true)
    },
  )
}

// POST /project/:id/github/connect: creates the project's GitHub repo and pushes its files.
// Owner only; requires a connected GitHub account. An Idempotency-Key stops a retried
// request from creating a second repository.
export async function connectProjectGithubHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  if (!(await withinLimit(reply, RATE_LIMITS.git, session.user.id))) return

  await withIdempotency(
    reply,
    session.user.id,
    request.headers["idempotency-key"],
    async () => {
      const result = await connectProjectToGithub(
        request.server,
        session.user.id,
        request.params.id,
      )
      if (result.ok) return { status: 200, body: result.data }
      if (result.reason === "no_github") {
        return {
          status: 409,
          body: {
            error: "Connect your GitHub account from Connections first.",
          },
        }
      }
      return gitFailure(result)
    },
  )
}

// GET /project/:id/sandbox/fs/list: lists a project folder for the file tree.
// Open to viewers.
export async function listProjectFilesHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const parsed = listPodFilesQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }

  const result = await listProjectFiles(
    request.server,
    session.user.id,
    request.params.id,
    parsed.data,
  )
  return result.ok ? result.data : fail(reply, result.reason, result.message)
}
