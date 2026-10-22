import type { Prisma } from "@forgeAI/database"
import { enqueueTask } from "@forgeAI/jobs"

export async function enqueueProjectCleanup(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<void> {
  await enqueueTask(tx, { type: "project.storage.delete", projectId })
  // Keep evidence even when RAG is temporarily unconfigured; the worker can retry later.
  await enqueueTask(tx, { type: "project.knowledge.delete", projectId })
}
