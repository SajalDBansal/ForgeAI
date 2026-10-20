import { randomUUID } from "node:crypto"
import {
  prisma,
  type Prisma,
  type BackgroundJob,
  type SecurityAuditEvent,
} from "@forgeAI/database"
import {
  auditSchema,
  taskSchema,
  roleForTask,
  type BackgroundTask,
  type AuditEvent,
} from "./contracts.js"

export * from "./contracts.js"

type JobWriter = Pick<Prisma.TransactionClient, "backgroundJob">

// Pass the business transaction so accepted changes and their jobs commit together.
export function enqueueTask(
  tx: JobWriter,
  input: BackgroundTask,
): Promise<BackgroundJob> {
  const task = taskSchema.parse(input)
  return tx.backgroundJob.create({
    data: { queue: roleForTask(task), payload: task },
  })
}

export function recordAudit(
  tx: Pick<Prisma.TransactionClient, "securityAuditEvent">,
  event: AuditEvent,
): Promise<SecurityAuditEvent> {
  const data = auditSchema.parse(event)
  // Store history with the business change; no queue delivery is needed for this insert.
  return tx.securityAuditEvent.create({
    data: { id: randomUUID(), ...data, occurredAt: new Date() },
  })
}

export async function retryFailedJob(id: string): Promise<boolean> {
  const result = await prisma.backgroundJob.updateMany({
    where: { id, status: "FAILED" },
    data: {
      status: "PENDING",
      attempts: 0,
      availableAt: new Date(),
      finishedAt: null,
      errorCode: null,
    },
  })
  return result.count === 1
}
