import { prisma } from "@forgeAI/database"
import { PermanentJobError } from "@forgeAI/jobs"
import type { TaskHandler } from "@forgeAI/jobs/worker"

// Drain legacy jobs without changing their IDs or original event times.
export const handle: TaskHandler = async (task, record) => {
  if (task.type !== "audit.record")
    throw new PermanentJobError("invalid_payload")
  await prisma.securityAuditEvent.upsert({
    where: { id: record.id },
    create: { id: record.id, ...task.event, occurredAt: record.createdAt },
    update: {},
  })
}
