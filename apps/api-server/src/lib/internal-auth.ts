import { timingSafeEqual } from "node:crypto"
import type { FastifyReply, FastifyRequest } from "fastify"

import { ENV_CONFIG } from "./envConfig.js"

// Guards the /internal routes, which only ForgeAI's own services call (the agent worker, I5b).
// They need `Authorization: Bearer <INTERNAL_API_TOKEN>`, compared in constant time. With no token
// configured, every internal request is refused, so a missing setting can't open them up.
export async function requireInternalToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const expected = ENV_CONFIG.INTERNAL_API_TOKEN
  const header = request.headers.authorization ?? ""
  const given = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : ""
  const matches =
    expected.length > 0 &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  if (!matches) await reply.status(401).send({ error: "Unauthorized" })
}
