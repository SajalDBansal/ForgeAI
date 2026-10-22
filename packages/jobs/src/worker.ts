import { prisma, type BackgroundJob } from "@forgeAI/database"
import { Queue, Worker } from "bullmq"
import { Redis } from "ioredis"
import {
  MAX_JOB_ATTEMPTS,
  PermanentJobError,
  queueName,
  retryDelay,
  roleForTask,
  taskSchema,
  type BackgroundTask,
  type WorkerRole,
} from "./contracts.js"

export type TaskHandler = (
  task: BackgroundTask,
  record: BackgroundJob,
) => Promise<void>

export async function processBackgroundJob(
  id: string,
  role: WorkerRole,
  handle: TaskHandler,
): Promise<void> {
  const record = await prisma.backgroundJob.findUnique({ where: { id } })
  if (!record || record.queue !== role || record.status !== "PENDING") return
  if (record.attempts >= MAX_JOB_ATTEMPTS) {
    await prisma.backgroundJob.update({
      where: { id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorCode: "attempts_exhausted",
      },
    })
    return
  }
  const attempt = await prisma.backgroundJob.update({
    where: { id },
    data: { attempts: { increment: 1 } },
  })
  try {
    const parsed = taskSchema.safeParse(record.payload)
    if (!parsed.success || roleForTask(parsed.data) !== role)
      throw new PermanentJobError("invalid_payload")
    await handle(parsed.data, attempt)
    await prisma.backgroundJob.update({
      where: { id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        errorCode: null,
      },
    })
  } catch (error) {
    const terminal =
      error instanceof PermanentJobError || attempt.attempts >= MAX_JOB_ATTEMPTS
    const errorCode =
      error instanceof PermanentJobError ? error.code : "task_failed"
    await prisma.backgroundJob.update({
      where: { id },
      data: {
        status: terminal ? "FAILED" : "PENDING",
        availableAt: new Date(Date.now() + retryDelay(attempt.attempts)),
        finishedAt: terminal ? new Date() : null,
        errorCode,
      },
    })
    // BullMQ persists errors in Redis; never put provider responses or task data there.
    throw new Error(errorCode)
  }
}

export interface BackgroundWorkerOptions {
  role: WorkerRole
  redisUrl: string
  concurrency: number
  handle: TaskHandler
  pollMs?: number
  prefix?: string
}

export function createBackgroundWorker(options: BackgroundWorkerOptions) {
  const { role } = options
  const connection = new Redis(options.redisUrl, { maxRetriesPerRequest: null })
  const deliveryConnection = new Redis(options.redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    commandTimeout: 5_000,
  })
  connection.on("error", () =>
    console.error(`[${role}-worker] queue connection unavailable`),
  )
  deliveryConnection.on("error", () =>
    console.error(`[${role}-worker] delivery connection unavailable`),
  )
  const queueOptions = {
    connection: deliveryConnection,
    ...(options.prefix && { prefix: options.prefix }),
  }
  const queue = new Queue<{ id: string }>(queueName(role), queueOptions)
  queue.on("error", () =>
    console.error(`[${role}-worker] delivery queue error`),
  )
  const worker = new Worker<{ id: string }>(
    queueName(role),
    (job) => processBackgroundJob(job.data.id, role, options.handle),
    {
      connection,
      concurrency: options.concurrency,
      ...(options.prefix && { prefix: options.prefix }),
    },
  )
  worker.on("error", () => console.error(`[${role}-worker] queue error`))
  worker.on("failed", (job) =>
    console.warn(`[${role}-worker] job failed`, job?.id),
  )
  let stopping = false
  let running: Promise<void> | undefined
  let lastReconciledAt = 0

  async function deliver(): Promise<void> {
    const records = await prisma.backgroundJob.findMany({
      where: {
        queue: role,
        status: "PENDING",
        availableAt: { lte: new Date() },
      },
      orderBy: [{ availableAt: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true, availableAt: true },
    })
    for (const record of records) {
      if (stopping) return
      const existing = await queue.getJob(record.id)
      if (existing) {
        const state = await existing.getState()
        if (state === "completed" || state === "failed") await existing.remove()
      }
      await queue.add(
        "execute",
        { id: record.id },
        {
          jobId: record.id,
          attempts: 1,
          removeOnComplete: { age: 3_600, count: 1_000 },
          removeOnFail: { age: 86_400, count: 1_000 },
        },
      )
      // Rotate already-delivered rows out of the first page. Conditional update cannot
      // overwrite a processor's newer retry schedule or a terminal result.
      await prisma.backgroundJob.updateMany({
        where: {
          id: record.id,
          status: "PENDING",
          availableAt: record.availableAt,
        },
        data: { availableAt: new Date(Date.now() + 30_000) },
      })
    }
    lastReconciledAt = Date.now()
  }

  function reconcile(): Promise<void> {
    if (stopping) return Promise.resolve()
    if (!running)
      running = deliver().finally(() => {
        running = undefined
      })
    return running
  }
  const tick = () =>
    void reconcile().catch(() =>
      console.error(`[${role}-worker] outbox delivery unavailable`),
    )
  const timer = setInterval(tick, options.pollMs ?? 2_000)
  timer.unref()
  tick()

  return {
    queue,
    worker,
    reconcile,
    async ready() {
      await deliveryConnection.ping()
      await prisma.$queryRaw`SELECT 1`
      if (
        stopping ||
        Date.now() - lastReconciledAt >
          Math.max(30_000, (options.pollMs ?? 2_000) * 3)
      )
        throw new Error("outbox_not_ready")
    },
    async close() {
      stopping = true
      clearInterval(timer)
      await running?.catch(() => undefined)
      await worker.close()
      await queue.close()
      connection.disconnect()
      deliveryConnection.disconnect()
    },
  }
}
