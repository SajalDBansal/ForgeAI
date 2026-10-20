import { randomUUID } from "node:crypto"
import { prisma, lockProjectRow, type AgentRun } from "@forgeAI/database"
import {
  AGENT_RUNS_QUEUE,
  agentRunJobId,
  SHUTDOWN_STOPPED_AGENT_RUN_MESSAGE,
  liveAttemptForRun,
  terminalStatusForAbort,
  type AgentRunAbortReason,
  type AgentRunJob,
  type AgentRunStatus,
} from "@forgeAI/shared"
import { DelayedError, Queue, type Job } from "bullmq"
import { Redis } from "ioredis"

import { answer, type AnswerResult } from "./answer.js"
import {
  AGENT_RUN_ACCESS_REVOKED_MESSAGE,
  canRunAgentForProject,
  type AgentRunAccessRecord,
} from "./access-policy.js"
import { ENV_CONFIG } from "./envConfig.js"
import { prepareRun } from "./prepare.js"
import {
  acquireProjectLock,
  publishAgentEvent,
  publishChatMessage,
  releaseProjectLock,
  renewProjectLock,
} from "./redis.js"
import { orchestrator, RunStop, withProjectLease } from "./services.js"
import { jobForPendingRun } from "./reconcile-policy.js"

/** Statuses after which a run never changes again. */
const FINISHED: AgentRunStatus[] = ["SUCCEEDED", "FAILED", "CANCELLED"]
const AFTER_CHECKPOINT_SEQ = -1

/** What people see when a run fails for a reason we didn't foresee. The details go to the log. */
const UNEXPECTED_FAILURE =
  "Something went wrong while the agent was working on this. Try again."

/** What people see when a run stopped after it had already changed the project, so it wasn't retried. */
const NOT_RETRIED =
  "The agent was interrupted after it had started changing the project, so it wasn't run again. Ask again to continue."
const LEASE_LOST =
  "The agent lost ownership of this project while it was working. Nothing further was applied by that worker; ask again to continue."

type RunAbortReason = AgentRunAbortReason | "lease_lost" | "access_revoked"

const activeRunAborts = new Map<
  string,
  { abort: (reason: AgentRunAbortReason) => void }
>()

const queueConnection = new Redis(ENV_CONFIG.REDIS_URL, {
  maxRetriesPerRequest: 1,
})
queueConnection.on("error", (err) =>
  console.error("[agent-worker:enqueue]", err),
)
const runQueue = new Queue<AgentRunJob>(AGENT_RUNS_QUEUE, {
  connection: queueConnection,
  defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 1000 },
})

async function enqueueRunJob(job: AgentRunJob): Promise<void> {
  await runQueue.add("run", job, { jobId: agentRunJobId(job) })
}

export async function reconcileAgentRunsOnce(): Promise<{
  scanned: number
  enqueued: number
}> {
  const pending = await prisma.agentRun.findMany({
    where: { status: { in: ["QUEUED", "WAITING_INPUT"] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
    select: { id: true, projectId: true, status: true },
  })

  let enqueued = 0
  for (const run of pending) {
    const status = run.status
    if (status !== "QUEUED" && status !== "WAITING_INPUT") continue
    const waitingReply =
      status === "WAITING_INPUT" ? await hasWaitingReply(run.id) : null
    const job = jobForPendingRun(
      { id: run.id, projectId: run.projectId, status },
      waitingReply?.id,
    )
    if (!job) continue
    try {
      await enqueueRunJob(job)
      enqueued += 1
    } catch (error) {
      console.error(
        "[agent-worker] could not reconcile queued run:",
        run.id,
        error,
      )
    }
  }

  return { scanned: pending.length, enqueued }
}

export function startRunReconciler(): () => void {
  let busy = false
  const reconcile = () => {
    if (busy) return
    busy = true
    void reconcileAgentRunsOnce()
      .catch((error) =>
        console.error("[agent-worker] run reconciliation failed:", error),
      )
      .finally(() => {
        busy = false
      })
  }
  reconcile()
  const timer = setInterval(reconcile, ENV_CONFIG.RUN_RECONCILE_MS)
  timer.unref()
  return () => clearInterval(timer)
}

export function abortActiveRunsForShutdown(): void {
  for (const active of activeRunAborts.values()) active.abort("worker_shutdown")
}

// Takes one run off the queue (work plan I5). A project's runs go one at a time, oldest first:
// a run that isn't next, or whose project is busy, goes back to wait and is looked at again shortly.
export async function processRun(
  job: Job<AgentRunJob>,
  token?: string,
): Promise<void> {
  const { runId, projectId } = job.data
  let run = await prisma.agentRun.findUnique({ where: { id: runId } })
  let currentAttempt = liveAttemptForRun(run?.attempts ?? 0)
  // Gone (project deleted) or already settled (finished, cancelled): nothing to do.
  if (!run || FINISHED.includes(run.status)) return
  if (!(await runHasWriteAccess(runId))) {
    await finish(
      run,
      currentAttempt,
      "FAILED",
      AGENT_RUN_ACCESS_REVOKED_MESSAGE,
    )
    return
  }

  // Oldest first: an earlier run of this project that hasn't finished goes before this one.
  const earlier = await prisma.agentRun.count({
    where: {
      projectId,
      createdAt: { lt: run.createdAt },
      status: { in: ["QUEUED", "RUNNING", "WAITING_INPUT"] },
    },
  })
  const lockToken = randomUUID()
  if (earlier > 0 || !(await acquireProjectLock(projectId, lockToken)))
    return waitForTurn(job, token)

  const runAbort = new AbortController()
  let abortReason: RunAbortReason | undefined
  const abortRun = (reason: RunAbortReason) => {
    if (runAbort.signal.aborted) return
    abortReason = reason
    runAbort.abort()
  }
  let renewBusy = false
  const loseLease = (error: unknown) => {
    if (runAbort.signal.aborted) return
    console.error("[agent-worker] project lease lost:", runId, error)
    abortRun("lease_lost")
  }
  activeRunAborts.set(runId, { abort: abortRun })
  const stopCancellationWatch = startCancellationWatch(runId, abortRun)
  const stopAccessWatch = startAccessWatch(runId, abortRun)

  // Keep the lock while working; it expires by itself if this process dies.
  const renew = setInterval(
    () => {
      if (renewBusy || runAbort.signal.aborted) return
      renewBusy = true
      renewProjectLock(projectId, lockToken)
        .then((renewed) => {
          if (!renewed) loseLease("renewal returned stale owner")
        })
        .catch(loseLease)
        .finally(() => {
          renewBusy = false
        })
    },
    Math.floor(ENV_CONFIG.RUN_LOCK_TTL_MS / 3),
  )

  try {
    await withProjectLease(
      { projectId, token: lockToken, signal: runAbort.signal },
      async () => {
        // Another delivery may have completed while this job waited for the project lock.
        run = await prisma.agentRun.findUnique({ where: { id: runId } })
        if (!run || FINISHED.includes(run.status)) return
        if (!(await runHasWriteAccess(runId))) {
          await finish(
            run,
            currentAttempt,
            "FAILED",
            AGENT_RUN_ACCESS_REVOKED_MESSAGE,
          )
          return
        }
        if (run.status === "WAITING_INPUT" && !(await hasWaitingReply(runId)))
          return
        // Picked up before (a crash or deploy stopped an earlier try). Retry only if nothing was
        // changed yet: a tool that ran may have edited files, and running again would do it twice.
        if (
          run.status !== "WAITING_INPUT" &&
          run.attempts > 0 &&
          (await prisma.agentStep.count({ where: { runId, seq: { gt: 0 } } })) >
            0
        ) {
          return await finish(run, run.attempts, "FAILED", NOT_RETRIED)
        }

        const attempt = run.attempts + 1
        currentAttempt = attempt
        const claimed = await prisma.agentRun.updateMany({
          where: { id: runId, status: { not: "CANCELLED" } },
          data: {
            status: "RUNNING",
            attempts: attempt,
            startedAt: new Date(),
            error: null,
            finishedAt: null,
          },
        })
        if (claimed.count === 0) {
          abortRun("user_cancelled")
          return
        }
        publishAgentEvent(projectId, {
          type: "run.status",
          runId,
          status: "RUNNING",
          attempt,
        })

        const result = await work(run, runAbort.signal)
        if (abortReason) throw new RunStop(abortMessage(abortReason))
        if (result.status === "waiting_input") {
          const waiting = await waitForInput(
            run,
            attempt,
            result.waitingOnMessageId,
          )
          if (!waiting) abortRun("user_cancelled")
          return
        }
        await finish(
          run,
          attempt,
          "SUCCEEDED",
          undefined,
          result.answeredMessageIds,
          runAbort.signal,
          () => abortMessage(abortReason),
        )
      },
    )
  } catch (error) {
    if (!run) throw error
    if (abortReason === "user_cancelled" || abortReason === "worker_shutdown") {
      const terminal = terminalStatusForAbort(abortReason)
      await finish(run, currentAttempt, terminal.status, terminal.error)
      return
    }
    if (abortReason === "access_revoked") {
      await finish(
        run,
        currentAttempt,
        "FAILED",
        AGENT_RUN_ACCESS_REVOKED_MESSAGE,
      )
      return
    }
    // A RunStop's message is written for people (e.g. the sandbox couldn't start); anything else
    // is unexpected: details to the log, a plain message to the chat.
    if (error instanceof RunStop) {
      await finish(
        run,
        currentAttempt,
        "FAILED",
        abortReason === "lease_lost" ? LEASE_LOST : error.message,
      )
    } else {
      console.error("[agent-worker] run failed:", runId, error)
      await finish(run, currentAttempt, "FAILED", UNEXPECTED_FAILURE)
    }
  } finally {
    clearInterval(renew)
    stopCancellationWatch()
    stopAccessWatch()
    activeRunAborts.delete(runId)
    await releaseProjectLock(projectId, lockToken).catch((err) =>
      console.error("[agent-worker] lock release failed:", runId, err),
    )
  }
}

// Not this run's turn yet: back on the queue for a short wait. BullMQ doesn't count this as a failure.
async function waitForTurn(
  job: Job<AgentRunJob>,
  token?: string,
): Promise<never> {
  await job.moveToDelayed(Date.now() + ENV_CONFIG.TURN_WAIT_MS, token)
  throw new DelayedError()
}

function abortMessage(reason: RunAbortReason | undefined): string {
  if (reason === "lease_lost") return LEASE_LOST
  if (reason === "access_revoked") return AGENT_RUN_ACCESS_REVOKED_MESSAGE
  if (reason) return terminalStatusForAbort(reason).error
  return SHUTDOWN_STOPPED_AGENT_RUN_MESSAGE
}

function startCancellationWatch(
  runId: string,
  abort: (reason: AgentRunAbortReason) => void,
): () => void {
  let busy = false
  const check = () => {
    if (busy) return
    busy = true
    void prisma.agentRun
      .findUnique({ where: { id: runId }, select: { status: true } })
      .then((row) => {
        if (row?.status === "CANCELLED") abort("user_cancelled")
      })
      .catch((error) =>
        console.error(
          "[agent-worker] could not check cancellation:",
          runId,
          error,
        ),
      )
      .finally(() => {
        busy = false
      })
  }
  check()
  const timer = setInterval(check, ENV_CONFIG.RUN_CANCEL_POLL_MS)
  timer.unref()
  return () => clearInterval(timer)
}

function startAccessWatch(
  runId: string,
  abort: (reason: "access_revoked") => void,
): () => void {
  let busy = false
  const check = () => {
    if (busy) return
    busy = true
    void runHasWriteAccess(runId)
      .then((allowed) => {
        if (!allowed) abort("access_revoked")
      })
      .catch((error) =>
        console.error(
          "[agent-worker] could not check run access:",
          runId,
          error,
        ),
      )
      .finally(() => {
        busy = false
      })
  }
  check()
  const timer = setInterval(check, ENV_CONFIG.RUN_CANCEL_POLL_MS)
  timer.unref()
  return () => clearInterval(timer)
}

async function runHasWriteAccess(runId: string): Promise<boolean> {
  const access = await accessForRun(runId)
  return access ? canRunAgentForProject(access) : false
}

async function accessForRun(
  runId: string,
): Promise<AgentRunAccessRecord | null> {
  const row = await prisma.agentRun.findUnique({
    where: { id: runId },
    select: {
      requestedById: true,
      project: {
        select: {
          archivedAt: true,
          workspace: {
            select: { id: true, archivedAt: true, userId: true },
          },
        },
      },
    },
  })
  if (!row) return null

  let requesterRole: AgentRunAccessRecord["requesterRole"] = null
  if (row.requestedById) {
    const collaborator = await prisma.collaborator.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: row.project.workspace.id,
          userId: row.requestedById,
        },
      },
      select: { role: true },
    })
    requesterRole = collaborator?.role ?? null
  }

  return {
    requestedById: row.requestedById,
    projectArchivedAt: row.project.archivedAt,
    workspaceArchivedAt: row.project.workspace.archivedAt,
    workspaceOwnerId: row.project.workspace.userId,
    requesterRole,
  }
}

// The run's work: prepare it (I5b: sandbox, knowledge graph, context), then the model answers (I6).
async function work(
  run: AgentRun,
  signal?: AbortSignal,
): Promise<AnswerResult> {
  const prepared = await prepareRun(run, signal)
  await ensureCheckpoint(run)
  return answer(run, prepared, signal)
}

// A message can be attached to a run just as the model finishes. If it was not accepted into the
// model handle, move it to one fresh run so the next worker turn answers it instead of losing it.
async function queueUnansweredMessages(
  run: AgentRun,
  answeredMessageIds: string[],
): Promise<void> {
  const pending = await prisma.$transaction(async (tx) => {
    await lockProjectRow(tx, run.projectId)
    await tx.agentRun.update({
      where: { id: run.id },
      data: { status: "SUCCEEDED", finishedAt: new Date(), error: null },
    })
    const unanswered = await tx.chatMessage.findMany({
      where: { runId: run.id, role: "USER", id: { notIn: answeredMessageIds } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { author: { select: { id: true, name: true, image: true } } },
    })
    if (unanswered.length === 0) return null
    const created = await tx.agentRun.create({
      data: {
        projectId: run.projectId,
        requestedById: unanswered[0]?.authorId ?? run.requestedById,
      },
    })
    await tx.chatMessage.updateMany({
      where: { id: { in: unanswered.map((message) => message.id) } },
      data: { runId: created.id },
    })
    return { next: created, unanswered }
  })
  if (!pending) return
  const { next, unanswered } = pending

  for (const row of unanswered) {
    publishChatMessage({
      id: row.id,
      projectId: row.projectId,
      role: row.role,
      kind: row.kind,
      content: row.content,
      payload: null,
      author: row.author,
      runId: next.id,
      createdAt: row.createdAt,
    })
  }

  try {
    await enqueueRunJob({ runId: next.id, projectId: run.projectId })
  } catch (error) {
    console.error(
      "[agent-worker] could not queue follow-up run; reconciler will retry:",
      next.id,
      error,
    )
  }
  publishAgentEvent(run.projectId, {
    type: "run.status",
    runId: next.id,
    status: "QUEUED",
    attempt: 1,
  })
}

// Records how a run ended and tells every tab. A failure also leaves a warning in the chat, so
// people can see why there was no answer after the live view clears.
async function finish(
  run: AgentRun,
  attempt: number,
  status: "SUCCEEDED" | "FAILED" | "CANCELLED",
  error?: string,
  answeredMessageIds: string[] = [],
  leaseSignal?: AbortSignal,
  abortError: () => string = () => LEASE_LOST,
): Promise<void> {
  if (leaseSignal?.aborted) throw new RunStop(abortError())
  if (status === "SUCCEEDED") {
    await recordFileChanges(run)
    if (leaseSignal?.aborted) throw new RunStop(abortError())
    await queueUnansweredMessages(run, answeredMessageIds)
  } else
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status, finishedAt: new Date(), ...(error && { error }) },
    })
  publishAgentEvent(run.projectId, {
    type: "run.status",
    runId: run.id,
    status,
    attempt,
    ...(error && { error }),
  })

  if (status === "FAILED" && error) {
    const row = await prisma.chatMessage.create({
      data: {
        projectId: run.projectId,
        role: "AGENT",
        kind: "WARNING",
        content: error,
        runId: run.id,
      },
    })
    publishChatMessage({
      id: row.id,
      projectId: row.projectId,
      role: row.role,
      kind: row.kind,
      content: row.content,
      payload: null,
      author: null,
      runId: row.runId,
      createdAt: row.createdAt,
    })
  }
}

async function ensureCheckpoint(run: AgentRun): Promise<void> {
  const existing = await prisma.agentStep.findUnique({
    where: { runId_seq: { runId: run.id, seq: 0 } },
  })
  if (existing) return

  const message = `ForgeAI checkpoint before agent run ${run.id}`
  const result = await orchestrator.checkpoint(run.projectId, {
    runId: run.id,
    seq: 0,
    message,
  })
  await prisma.$transaction(async (tx) => {
    await tx.agentStep.create({
      data: {
        runId: run.id,
        seq: 0,
        tool: "checkpoint",
        input: { message },
        outputSummary: result.commit,
      },
    })
    await tx.agentCheckpointArtifact.create({
      data: {
        runId: run.id,
        projectId: run.projectId,
        seq: 0,
        commit: result.commit,
        key: result.artifact.key,
        sha256: result.artifact.sha256,
        bytes: result.artifact.bytes,
      },
    })
  })
}

async function recordFileChanges(run: AgentRun): Promise<void> {
  const checkpoint = await prisma.agentStep.findUnique({
    where: { runId_seq: { runId: run.id, seq: 0 } },
    select: { outputSummary: true },
  })
  const commit = checkpoint?.outputSummary
  if (!commit) return

  const diff = await orchestrator
    .diffCheckpoint(run.projectId, { commit })
    .catch((error) => {
      console.error("[agent-worker] could not diff checkpoint:", run.id, error)
      return undefined
    })
  if (!diff) return

  await prisma.agentFileChange.deleteMany({ where: { runId: run.id } })
  if (diff.files.length === 0) return

  await ensureAfterCheckpoint(run).catch((error) =>
    console.error(
      "[agent-worker] could not save after-run checkpoint:",
      run.id,
      error,
    ),
  )

  await prisma.agentFileChange.createMany({
    data: diff.files.map((file) => ({
      runId: run.id,
      path: file.path,
      action: file.action.toUpperCase() as "CREATED" | "UPDATED" | "DELETED",
      additions: file.additions,
      deletions: file.deletions,
    })),
  })

  const row = await prisma.chatMessage.create({
    data: {
      projectId: run.projectId,
      role: "AGENT",
      kind: "FILES",
      content: `Changed ${diff.files.length} file${diff.files.length === 1 ? "" : "s"}.`,
      payload: { files: diff.files },
      runId: run.id,
    },
  })
  publishChatMessage({
    id: row.id,
    projectId: row.projectId,
    role: row.role,
    kind: row.kind,
    content: row.content,
    payload: { files: diff.files },
    author: null,
    runId: row.runId,
    createdAt: row.createdAt,
  })
}

async function ensureAfterCheckpoint(run: AgentRun): Promise<void> {
  const existing = await prisma.agentStep.findUnique({
    where: { runId_seq: { runId: run.id, seq: AFTER_CHECKPOINT_SEQ } },
  })
  if (existing) return

  const message = `ForgeAI checkpoint after agent run ${run.id}`
  const result = await orchestrator.checkpoint(run.projectId, {
    runId: run.id,
    seq: AFTER_CHECKPOINT_SEQ,
    message,
  })
  await prisma.$transaction(async (tx) => {
    await tx.agentStep.create({
      data: {
        runId: run.id,
        seq: AFTER_CHECKPOINT_SEQ,
        tool: "checkpoint.after",
        input: { message },
        outputSummary: result.commit,
      },
    })
    await tx.agentCheckpointArtifact.create({
      data: {
        runId: run.id,
        projectId: run.projectId,
        seq: AFTER_CHECKPOINT_SEQ,
        commit: result.commit,
        key: result.artifact.key,
        sha256: result.artifact.sha256,
        bytes: result.artifact.bytes,
      },
    })
  })
}

async function waitForInput(
  run: AgentRun,
  attempt: number,
  waitingOnMessageId?: string,
): Promise<boolean> {
  const saved = await prisma.$transaction(async (tx) => {
    await lockProjectRow(tx, run.projectId)
    const updated = await tx.agentRun.updateMany({
      where: { id: run.id, status: { not: "CANCELLED" } },
      data: {
        status: "WAITING_INPUT",
        ...(waitingOnMessageId ? {} : { error: "Waiting for your answer." }),
      },
    })
    return updated.count > 0
  })
  if (!saved) return false
  publishAgentEvent(run.projectId, {
    type: "run.status",
    runId: run.id,
    status: "WAITING_INPUT",
    attempt,
    ...(waitingOnMessageId && { waitingOnMessageId }),
  })
  // A fast reply may arrive before WAITING_INPUT is saved; give it a durable queue job too.
  const reply = await hasWaitingReply(run.id)
  if (reply) {
    const job = { runId: run.id, projectId: run.projectId, messageId: reply.id }
    await enqueueRunJob(job).catch((error) =>
      console.error(
        "[agent-worker] could not queue waiting reply; reconciler will retry:",
        run.id,
        error,
      ),
    )
  }
  return true
}

async function hasWaitingReply(runId: string) {
  const question = await prisma.chatMessage.findFirst({
    where: { runId, role: "AGENT", kind: { in: ["QUESTION", "PERMISSION"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true },
  })
  if (!question) return null
  return prisma.chatMessage.findFirst({
    where: { runId, role: "USER", createdAt: { gt: question.createdAt } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  })
}

export async function closeRunQueue(): Promise<void> {
  await runQueue.close().catch(() => undefined)
  await queueConnection.quit().catch(() => undefined)
}
