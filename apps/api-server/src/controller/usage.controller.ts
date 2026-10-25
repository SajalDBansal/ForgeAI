import type { FastifyReply, FastifyRequest } from "fastify"

import { requireSession } from "../lib/session.js"
import { usageSummary } from "../service/usage.service.js"

// GET /usage: real platform/model usage for the signed-in account.
export async function usageSummaryHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  return usageSummary(session.user.id)
}
