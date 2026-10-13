import fp from "fastify-plugin"
import type { FastifyReply, FastifyRequest } from "fastify"
import {
  publicAbuseLimitForRequest,
  requestRateLimitSubject,
} from "../lib/rate-limit-policy.js"
import { withinLimit } from "../lib/rate-limit.js"

function requestPath(request: FastifyRequest): string {
  return new URL(request.url, "http://api.local").pathname
}

export async function limitPublicAbuse(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const match = publicAbuseLimitForRequest(request.method, requestPath(request))
  if (!match) return

  const subject = `${requestRateLimitSubject(request)}:${match.scope}`
  await withinLimit(reply, match.limit, subject)
}

export default fp(async (fastify) => {
  fastify.addHook("preHandler", limitPublicAbuse)
})
