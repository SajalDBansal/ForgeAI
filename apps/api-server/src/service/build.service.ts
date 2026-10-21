import { Prisma, prisma, lockProjectRow } from "@forgeAI/database"
import { recordAudit } from "@forgeAI/jobs"
import {
  AgentCheckpointRestoreResult,
  ChatMessage,
  chatMessagePayloadSchema,
  CreateChatMessageDataType,
  ListChatMessagesQuery,
  ProjectCommit,
  ProjectDetail,
  ProjectInfoData,
  projectInfoSchema,
  ProjectSecretSummary,
  RecordProjectCommitDataType,
  recordProjectCommitSchema,
  UpdateProjectInfoDataType,
  USER_CANCELLED_AGENT_RUN_MESSAGE,
  liveAttemptForRun,
  updateProjectInfoSchema,
  UpsertProjectSecretDataType,
} from "@forgeAI/shared"
import type { FastifyInstance } from "fastify"
import {
  decryptProjectSecret,
  encryptProjectSecret,
} from "../lib/encryption.js"
import { ENV_CONFIG } from "../lib/envConfig.js"
import { publishProjectEvent } from "../lib/project-events.js"
import {
  enqueueAgentRun,
  publishAgentEvent,
  publishAgentRunInput,
  removeAgentRunJob,
} from "../lib/agent-queue.js"
import {
  liveProjectFilter,
  projectAccessFilter,
} from "./project-access-policy.js"

const FINISHED_AGENT_RUN_STATUSES = ["SUCCEEDED", "FAILED", "CANCELLED"]

// ---------- ACCESS ----------

export { liveProjectFilter, projectAccessFilter }

// Checks whether the user has read or write access to the project.
// The standard guard for build endpoints.
export async function canAccessProject(
  userId: string,
  projectId: string,
  access: "read" | "write",
): Promise<boolean> {
  const count = await prisma.project.count({
    where: projectAccessFilter(userId, projectId, access),
  })
  return count > 0
}

// Checks live read access: membership plus non-archived project/workspace.
export async function canAccessLiveProject(
  userId: string,
  projectId: string,
): Promise<boolean> {
  const count = await prisma.project.count({
    where: liveProjectFilter(userId, projectId),
  })
  return count > 0
}

// ---------- MAPPERS ----------

const secretSummarySelect = {
  id: true,
  key: true,
  scope: true,
  updatedAt: true,
} as const

const chatMessageInclude = {
  author: { select: { id: true, name: true, image: true } },
} as const

// Maps a chat row to the API shape, dropping a payload that no longer validates.
// Used for every chat read and broadcast.
function toChatMessage(
  row: Prisma.ChatMessageGetPayload<{ include: typeof chatMessageInclude }>,
): ChatMessage {
  const payload =
    row.payload === null
      ? null
      : chatMessagePayloadSchema.safeParse(row.payload)
  return {
    id: row.id,
    projectId: row.projectId,
    role: row.role,
    kind: row.kind,
    content: row.content,
    payload: payload?.success ? payload.data : null,
    author: row.author,
    runId: row.runId,
    createdAt: row.createdAt,
  }
}

// Maps a commit row to the API shape, parsing its JSON `files` column.
// Used for History and commit events.
export function toProjectCommit(
  row: Prisma.ProjectCommitGetPayload<object>,
): ProjectCommit {
  return {
    ...row,
    files: Array.isArray(row.files)
      ? (row.files as ProjectCommit["files"])
      : null,
  }
}

// Re-validates the stored Info JSON so old or partial documents come back complete.
// Falls back to an empty document if it's unreadable.
function toProjectInfo(data: unknown): ProjectInfoData {
  const parsed = projectInfoSchema.safeParse(data ?? {})
  return parsed.success ? parsed.data : projectInfoSchema.parse({})
}

// ---------- PROJECT ----------

// Loads a readable project with its repo and Info document.
// Backs GET /project/:id.
export async function getProjectDetail(
  userId: string,
  projectId: string,
): Promise<ProjectDetail | null> {
  const project = await prisma.project.findFirst({
    where: projectAccessFilter(userId, projectId, "read"),
    include: { repo: true, info: true },
  })
  if (!project) return null

  const { info, ...rest } = project
  return { project: rest, info: toProjectInfo(info?.data) }
}

// ---------- CHAT ----------

// Pages backwards through a project's agent chat using a message-id cursor.
// Returns messages oldest-first for display, plus whether more exist.
export async function listChatMessages(
  projectId: string,
  query: ListChatMessagesQuery,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  // Newest first so the cursor pages backwards through history, then flipped for display.
  const rows = await prisma.chatMessage.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    include: chatMessageInclude,
    ...(query.before && { cursor: { id: query.before }, skip: 1 }),
  })
  const hasMore = rows.length > query.limit
  return {
    messages: rows.slice(0, query.limit).reverse().map(toChatMessage),
    hasMore,
  }
}

// Stores a user's chat message and broadcasts it to the project's tabs.
// Backs POST /project/:id/messages.
export async function createUserChatMessage(
  projectId: string,
  userId: string,
  input: CreateChatMessageDataType,
): Promise<ChatMessage> {
  const row = await prisma.chatMessage.create({
    data: {
      projectId,
      role: "USER",
      kind: "TEXT",
      content: input.content,
      authorId: userId,
    },
    include: chatMessageInclude,
  })
  const message = toChatMessage(row)
  publishProjectEvent({ type: "message.created", projectId, message })
  return message
}

type AgentMessageStart =
  | { mode: "new"; message: ChatMessage; runId: string }
  | { mode: "joined"; message: ChatMessage; runId: string }
  | {
      mode: "resumed"
      message: ChatMessage
      runId: string
      nextAttempt: number
    }

// Starts or joins an agent run for a person's message (work plan I5/I5c). If the project's agent is
// already RUNNING, the new message belongs to that run and is signalled to the worker. Otherwise the
// message and a new AgentRun are saved together, and the run is queued for the worker.
export async function startAgentRun(
  projectId: string,
  userId: string,
  input: CreateChatMessageDataType,
): Promise<ChatMessage> {
  const started = await prisma.$transaction(
    async (tx): Promise<AgentMessageStart> => {
      await lockProjectRow(tx, projectId)
      const active = await tx.agentRun.findFirst({
        where: { projectId, status: { in: ["RUNNING", "WAITING_INPUT"] } },
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, attempts: true },
      })
      if (active) {
        const row = await tx.chatMessage.create({
          data: {
            projectId,
            role: "USER",
            kind: "TEXT",
            content: input.content,
            authorId: userId,
            runId: active.id,
          },
          include: chatMessageInclude,
        })
        return active.status === "WAITING_INPUT"
          ? {
              mode: "resumed",
              message: toChatMessage(row),
              runId: active.id,
              nextAttempt: active.attempts + 1,
            }
          : { mode: "joined", message: toChatMessage(row), runId: active.id }
      }

      const run = await tx.agentRun.create({
        data: { projectId, requestedById: userId },
      })
      const row = await tx.chatMessage.create({
        data: {
          projectId,
          role: "USER",
          kind: "TEXT",
          content: input.content,
          authorId: userId,
          runId: run.id,
        },
        include: chatMessageInclude,
      })
      return { mode: "new", message: toChatMessage(row), runId: run.id }
    },
  )
  const { message, runId } = started
  publishProjectEvent({ type: "message.created", projectId, message })

  if (started.mode === "joined") {
    publishAgentRunInput({
      type: "user.message",
      runId,
      messageId: message.id,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })
    return message
  }

  if (started.mode === "resumed") {
    try {
      await enqueueAgentRun({ runId, projectId, messageId: message.id })
    } catch (error) {
      console.error(
        "[agent] could not resume waiting run; reconciler will retry",
        runId,
        error,
      )
    }
    publishAgentEvent(projectId, {
      type: "run.status",
      runId,
      status: "QUEUED",
      attempt: started.nextAttempt,
    })
    return message
  }

  try {
    await enqueueAgentRun({ runId, projectId })
  } catch (error) {
    console.error(
      "[agent] could not queue run; reconciler will retry",
      runId,
      error,
    )
  }
  publishAgentEvent(projectId, {
    type: "run.status",
    runId,
    status: "QUEUED",
    attempt: 1,
  })
  return message
}

export type CancelAgentRunResult =
  | { ok: true; status: "cancelled" | "already_finished" }
  | { ok: false; reason: "not_found" }

export async function cancelAgentRun(
  userId: string,
  projectId: string,
  runId: string,
): Promise<CancelAgentRunResult> {
  if (!(await canAccessProject(userId, projectId, "write")))
    return { ok: false, reason: "not_found" }

  const result = await prisma.$transaction(async (tx) => {
    await lockProjectRow(tx, projectId)
    const run = await tx.agentRun.findFirst({
      where: { id: runId, projectId },
      select: { id: true, status: true, attempts: true },
    })
    if (!run) return null
    if (FINISHED_AGENT_RUN_STATUSES.includes(run.status)) {
      return { run, changed: false }
    }
    const updated = await tx.agentRun.update({
      where: { id: runId },
      data: {
        status: "CANCELLED",
        finishedAt: new Date(),
        error: USER_CANCELLED_AGENT_RUN_MESSAGE,
      },
      select: { id: true, status: true, attempts: true },
    })
    return { run: updated, changed: true }
  })

  if (!result) return { ok: false, reason: "not_found" }
  if (!result.changed) return { ok: true, status: "already_finished" }

  await removeAgentRunJob({ runId, projectId }).catch((error) =>
    console.error(
      "[agent] could not remove cancelled queued run:",
      runId,
      error,
    ),
  )
  publishAgentEvent(projectId, {
    type: "run.status",
    runId,
    status: "CANCELLED",
    attempt: liveAttemptForRun(result.run.attempts),
    error: USER_CANCELLED_AGENT_RUN_MESSAGE,
  })
  return { ok: true, status: "cancelled" }
}

export type UndoAgentRunResult =
  | { ok: true; files: number }
  | {
      ok: false
      reason:
        | "not_found"
        | "no_checkpoint"
        | "unsafe"
        | "conflict"
        | "active_run"
        | "no_pod"
        | "orchestrator_failed"
      message?: string
    }

export async function undoAgentRun(
  app: FastifyInstance,
  userId: string,
  projectId: string,
  runId: string,
): Promise<UndoAgentRunResult> {
  if (!(await canAccessProject(userId, projectId, "write")))
    return { ok: false, reason: "not_found" }

  const run = await prisma.agentRun.findFirst({
    where: { id: runId, projectId, status: "SUCCEEDED" },
    include: {
      steps: {
        where: {
          OR: [
            { seq: 0, tool: "checkpoint" },
            { seq: -1, tool: "checkpoint.after" },
          ],
        },
      },
      fileChanges: true,
      checkpoints: true,
    },
  })
  if (!run) return { ok: false, reason: "not_found" }

  if (run.fileChanges.length === 0) return { ok: true, files: 0 }

  const activeRun = await prisma.agentRun.findFirst({
    where: {
      projectId,
      id: { not: runId },
      status: { in: ["QUEUED", "RUNNING", "WAITING_INPUT"] },
    },
    select: { id: true },
  })
  if (activeRun)
    return {
      ok: false,
      reason: "active_run",
      message:
        "Wait for the active agent run to finish before undoing earlier work.",
    }

  const beforeCommit = run.steps.find(
    (step) => step.seq === 0 && step.tool === "checkpoint",
  )?.outputSummary
  if (!beforeCommit) return { ok: false, reason: "no_checkpoint" }
  const beforeArtifact = run.checkpoints.find(
    (artifact) => artifact.seq === 0 && artifact.commit === beforeCommit,
  )
  if (!beforeArtifact)
    return {
      ok: false,
      reason: "unsafe",
      message:
        "That run has no durable before-checkpoint artifact, so it cannot be undone automatically after sandbox recovery.",
    }
  const afterCommit = run.steps.find(
    (step) => step.seq === -1 && step.tool === "checkpoint.after",
  )?.outputSummary
  if (!afterCommit)
    return {
      ok: false,
      reason: "unsafe",
      message:
        "That run was created before safe Undo tracking was available, so it cannot be undone automatically.",
    }
  const afterArtifact = run.checkpoints.find(
    (artifact) => artifact.seq === -1 && artifact.commit === afterCommit,
  )
  if (!afterArtifact)
    return {
      ok: false,
      reason: "unsafe",
      message:
        "That run has no durable after-checkpoint artifact, so it cannot be undone automatically after sandbox recovery.",
    }

  const restored = await restoreAgentCheckpoint(app, projectId, {
    beforeCommit,
    afterCommit,
    beforeArtifact: {
      key: beforeArtifact.key,
      sha256: beforeArtifact.sha256,
      bytes: beforeArtifact.bytes,
    },
    afterArtifact: {
      key: afterArtifact.key,
      sha256: afterArtifact.sha256,
      bytes: afterArtifact.bytes,
    },
    paths: run.fileChanges.map((file) => file.path),
  })
  if (!restored.ok) return restored

  const row = await prisma.chatMessage.create({
    data: {
      projectId,
      role: "AGENT",
      kind: "SUCCESS",
      content: `Undid agent run ${runId.slice(0, 8)}. Restored ${run.fileChanges.length} file${run.fileChanges.length === 1 ? "" : "s"} from its checkpoint.`,
      runId,
    },
    include: chatMessageInclude,
  })
  publishProjectEvent({
    type: "message.created",
    projectId,
    message: toChatMessage(row),
  })
  return { ok: true, files: run.fileChanges.length }
}

async function restoreAgentCheckpoint(
  app: FastifyInstance,
  projectId: string,
  input: {
    beforeCommit: string
    afterCommit: string
    beforeArtifact: { key: string; sha256: string; bytes: number }
    afterArtifact: { key: string; sha256: string; bytes: number }
    paths: string[]
  },
): Promise<
  | { ok: true }
  | {
      ok: false
      reason: "no_pod" | "conflict" | "orchestrator_failed"
      message?: string
    }
> {
  const res = await app.orchestrator.request({
    method: "POST",
    path: `/api/v1/sandbox/${encodeURIComponent(projectId)}/restore-checkpoint`,
    headers: {
      authorization: `Bearer ${ENV_CONFIG.ORCHESTRATOR_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  })
  if (res.statusCode === 404) {
    await res.body.dump().catch(() => undefined)
    return {
      ok: false,
      reason: "no_pod",
      message: "Open the project first, then try undo again.",
    }
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const body = (await res.body.json().catch(() => ({}))) as { error?: string }
    if (res.statusCode === 409)
      return {
        ok: false,
        reason: "conflict",
        ...(body.error && { message: body.error }),
      }
    return {
      ok: false,
      reason: "orchestrator_failed",
      ...(body.error && { message: body.error }),
    }
  }
  ;(await res.body.json().catch(() => undefined)) as
    AgentCheckpointRestoreResult | undefined
  return { ok: true }
}

// ---------- SECRETS ----------

// Lists a project's secret keys and scopes, never values.
// Backs the Cloud tab.
export async function listProjectSecrets(
  projectId: string,
): Promise<ProjectSecretSummary[]> {
  return prisma.projectSecret.findMany({
    where: { projectId },
    select: secretSummarySelect,
    orderBy: { key: "asc" },
  })
}

// Encrypts and stores a secret, replacing any with the same key, and broadcasts it.
// Only the key and scope travel in the event, never the value.
export async function upsertProjectSecret(
  projectId: string,
  input: UpsertProjectSecretDataType,
  actorId?: string,
): Promise<ProjectSecretSummary> {
  const valueEnc = encryptProjectSecret(input.value)
  const secret = await prisma.$transaction(async (tx) => {
    const row = await tx.projectSecret.upsert({
      where: { projectId_key: { projectId, key: input.key } },
      create: { projectId, key: input.key, valueEnc, scope: input.scope },
      update: { valueEnc, scope: input.scope },
      select: secretSummarySelect,
    })
    await recordAudit(tx, {
      action: "secret.saved",
      actorId,
      projectId,
      targetId: row.id,
    })
    return row
  })
  publishProjectEvent({ type: "secret.upserted", projectId, secret })
  return secret
}

// Decrypts one secret's value, or returns null if it doesn't exist.
// Backs the "reveal" button.
export async function revealProjectSecret(
  projectId: string,
  secretId: string,
  actorId?: string,
): Promise<string | null> {
  const secret = await prisma.projectSecret.findFirst({
    where: { id: secretId, projectId },
    select: { valueEnc: true },
  })
  if (!secret) return null
  const value = decryptProjectSecret(secret.valueEnc)
  await recordAudit(prisma, {
    action: "secret.revealed",
    actorId,
    projectId,
    targetId: secretId,
  })
  return value
}

// Decrypts all of a project's RUNTIME secrets, as name -> value, for its sandbox (I1).
// BUILD secrets are for deploys and are never sent to the sandbox.
export async function runtimeSecretsFor(
  projectId: string,
): Promise<Record<string, string>> {
  const rows = await prisma.projectSecret.findMany({
    where: { projectId, scope: "RUNTIME" },
    select: { key: true, valueEnc: true },
  })
  return Object.fromEntries(
    rows.map((row) => [row.key, decryptProjectSecret(row.valueEnc)]),
  )
}

// Decrypted only for the internal agent worker, so tool output can be redacted before it reaches
// the model or the shared chat. Not exposed on browser routes.
export async function secretRedactionsForAgent(
  projectId: string,
  userId: string,
): Promise<{ key: string; value: string }[] | null> {
  if (!(await canAccessProject(userId, projectId, "write"))) return null

  const rows = await prisma.projectSecret.findMany({
    where: { projectId },
    select: { key: true, valueEnc: true },
  })
  return rows.map((row) => ({
    key: row.key,
    value: decryptProjectSecret(row.valueEnc),
  }))
}

// Deletes a secret and broadcasts the removal.
// Returns false when there was nothing to delete.
export async function deleteProjectSecret(
  projectId: string,
  secretId: string,
  actorId?: string,
): Promise<boolean> {
  const count = await prisma.$transaction(async (tx) => {
    const removed = await tx.projectSecret.deleteMany({
      where: { id: secretId, projectId },
    })
    if (removed.count)
      await recordAudit(tx, {
        action: "secret.deleted",
        actorId,
        projectId,
        targetId: secretId,
      })
    return removed.count
  })
  if (count === 0) return false
  publishProjectEvent({ type: "secret.deleted", projectId, secretId })
  return true
}

// ---------- HISTORY ----------

// Lists a project's commits, newest first.
// Backs the History tab.
export async function listProjectCommits(
  projectId: string,
): Promise<ProjectCommit[]> {
  const rows = await prisma.projectCommit.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  })
  return rows.map(toProjectCommit)
}

// Records a new commit as HEAD and broadcasts it.
// Called by the agent pipeline, not by an HTTP route.
export async function recordProjectCommit(
  projectId: string,
  input: RecordProjectCommitDataType,
): Promise<ProjectCommit> {
  const data = recordProjectCommitSchema.parse(input)
  const [, row] = await prisma.$transaction([
    prisma.projectCommit.updateMany({
      where: { projectId, isHead: true },
      data: { isHead: false },
    }),
    prisma.projectCommit.create({ data: { ...data, projectId, isHead: true } }),
  ])
  const commit = toProjectCommit(row)
  publishProjectEvent({ type: "commit.created", projectId, commit })
  return commit
}

// ---------- INFORMATION ----------

// Replaces the given sections of the Info document and broadcasts the result.
// Called by the agent pipeline.
export async function updateProjectInfo(
  projectId: string,
  patch: UpdateProjectInfoDataType,
): Promise<ProjectInfoData> {
  const changes = updateProjectInfoSchema.parse(patch)
  const current = await prisma.projectInfo.findUnique({ where: { projectId } })
  const info = projectInfoSchema.parse({
    ...toProjectInfo(current?.data),
    ...changes,
  })

  await prisma.projectInfo.upsert({
    where: { projectId },
    create: { projectId, data: info },
    update: { data: info },
  })
  publishProjectEvent({ type: "info.updated", projectId, info })
  return info
}
