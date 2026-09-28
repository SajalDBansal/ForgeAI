import { checkReadiness, readinessResponse } from "@forgeAI/shared"
import type { FastifyReply, FastifyRequest } from "fastify"

import { checkPresenceRedis } from "../lib/presence.js"
import { checkRedis } from "../lib/redis.js"

// GET /healthz: the process is up. Checks nothing else, so a Redis blip never gets it restarted.
// The liveness probe.
export async function healthzHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  return reply.send({ status: "ok" })
}

// GET /readyz: Redis answers on every connection this service uses; 503 names what failed.
// The readiness probe: failing it stops traffic without restarting the process.
export async function readyzHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const report = await checkReadiness({
    redis: () => Promise.all([checkRedis(), checkPresenceRedis()]),
  })
  if (!report.ready)
    request.log.warn(
      { checks: report.checks, errors: report.errors },
      "not ready",
    )

  const { status, body } = readinessResponse(report)
  return reply.status(status).send(body)
}
