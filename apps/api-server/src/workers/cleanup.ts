import { prisma } from "@forgeAI/database"
import { PermanentJobError } from "@forgeAI/jobs"
import type { TaskHandler } from "@forgeAI/jobs/worker"
import { createR2Client } from "@forgeAI/sandbox-provider"
import { agentLiveRevisionKey, agentLiveStateKey } from "@forgeAI/shared"
import { Redis } from "ioredis"

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}
const r2 = createR2Client({
  accessKeyId: required("R2_ACCESS_KEY_ID"),
  secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  endpoint: required("R2_BUCKET_ENDPOINT"),
  bucketName: required("R2_BUCKET_NAME"),
})
const redis = new Redis(required("REDIS_URL"), { maxRetriesPerRequest: 1 })
redis.on("error", () => console.error("[cleanup-worker] Redis unavailable"))

export const handle: TaskHandler = async (task) => {
  if (
    task.type !== "project.storage.delete" &&
    task.type !== "project.knowledge.delete"
  )
    throw new PermanentJobError("invalid_payload")
  // A stale or malformed job can never delete a live project's resources.
  if (await prisma.project.count({ where: { id: task.projectId } }))
    throw new PermanentJobError("invalid_payload")
  if (task.type === "project.storage.delete") {
    const prefix = `${process.env.R2_SNAPSHOT_FOLDER_NAME || "snapshots"}/${task.projectId}/`
    for (const key of await r2.listObjects(prefix)) {
      if (!key.startsWith(prefix))
        throw new PermanentJobError("invalid_payload")
      await r2.deleteObject(key)
    }
    await redis.del(
      agentLiveStateKey(task.projectId),
      agentLiveRevisionKey(task.projectId),
    )
  } else {
    const response = await fetch(
      `${required("RAG_SERVICE_URL")}/projects/${encodeURIComponent(task.projectId)}`,
      {
        method: "DELETE",
        headers: { "x-rag-secret": required("RAG_SERVICE_SECRET") },
        signal: AbortSignal.timeout(30_000),
      },
    )
    await response.body?.cancel()
    if (!response.ok && response.status !== 404)
      throw new Error("rag_delete_failed")
  }
}

// Bounded batches keep retention from competing with user requests for long transactions.
export async function runMaintenance(): Promise<void> {
  const expired = await prisma.invitation.findMany({
    where: { status: "PENDING", expiresAt: { lte: new Date() } },
    select: { id: true },
    take: 500,
  })
  await prisma.invitation.updateMany({
    where: {
      id: { in: expired.map((row) => row.id) },
      status: "PENDING",
      expiresAt: { lte: new Date() },
    },
    data: { status: "EXPIRED" },
  })
  const days = Number(process.env.AUDIT_RETENTION_DAYS || 90)
  if (!Number.isInteger(days) || days < 1)
    throw new Error("Invalid AUDIT_RETENTION_DAYS")
  const events = await prisma.securityAuditEvent.findMany({
    where: { occurredAt: { lt: new Date(Date.now() - days * 86_400_000) } },
    select: { id: true },
    take: 500,
  })
  await prisma.securityAuditEvent.deleteMany({
    where: { id: { in: events.map((row) => row.id) } },
  })
  const jobs = await prisma.backgroundJob.findMany({
    where: {
      status: "COMPLETED",
      finishedAt: { lt: new Date(Date.now() - 7 * 86_400_000) },
    },
    select: { id: true },
    take: 500,
  })
  await prisma.backgroundJob.deleteMany({
    where: { id: { in: jobs.map((row) => row.id) }, status: "COMPLETED" },
  })
}
let retaining: Promise<void> | undefined
const retention = setInterval(() => {
  if (!retaining)
    retaining = runMaintenance()
      .catch(() => console.error("[cleanup-worker] retention failed"))
      .finally(() => {
        retaining = undefined
      })
}, 60_000)
retention.unref()
export async function close(): Promise<void> {
  clearInterval(retention)
  await retaining
  redis.disconnect()
}
