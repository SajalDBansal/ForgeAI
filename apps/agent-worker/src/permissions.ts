import { prisma } from "@forgeAI/database"
import { isApproval } from "./guardrails.js"

// Claim one explicit approval atomically; saving the permission request itself never consumes it.
export async function consumeCommandApproval(
  runId: string,
  key: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const latest = await tx.chatMessage.findFirst({
      where: { runId, role: "AGENT", kind: "PERMISSION" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    })
    if (!latest) return false
    await tx.$queryRaw`SELECT "id" FROM "ChatMessage" WHERE "id" = ${latest.id} FOR UPDATE`
    const permission = await tx.chatMessage.findUnique({
      where: { id: latest.id },
    })
    const payload = permission?.payload
    if (
      !permission ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    )
      return false
    if (payload.approvalKey !== key || payload.approvalConsumed === true)
      return false

    const reply = await tx.chatMessage.findFirst({
      where: { runId, role: "USER", createdAt: { gt: permission.createdAt } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { content: true },
    })
    if (!reply || !isApproval(reply.content)) return false
    await tx.chatMessage.update({
      where: { id: permission.id },
      data: {
        payload: { ...payload, approvalConsumed: true },
      },
    })
    return true
  })
}
