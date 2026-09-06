import type { Prisma } from "../generated/client/index.js"

// Serialize message attachment and run transitions using the project's existing database row.
export async function lockProjectRow(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`
}
