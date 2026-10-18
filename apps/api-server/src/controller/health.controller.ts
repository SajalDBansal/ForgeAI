import { prisma } from "@forgeAI/database"
import {
  checkReadiness,
  checkRedisConnection,
  readinessResponse,
} from "@forgeAI/shared"
import type { FastifyReply, FastifyRequest } from "fastify"

import { redis as eventsRedis } from "../lib/project-events.js"
import { redis as cacheRedis } from "../lib/redis.js"

// GET /healthz (and /api/v1/health/live): the process is up. Checks nothing else,
// so a database or Redis blip never gets it restarted. The liveness probe.
export async function getLiveCheckHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  return reply.send({ status: "ok" })
}

// GET /readyz (and /api/v1/health/ready): Postgres and both Redis connections answer; 503 names
// what failed. The readiness probe: failing it stops traffic to this copy, not the process.
//
// The orchestrator is deliberately not checked. It's one shared service: if it restarted, every
// api-server copy would turn unready at once and the whole API (sign-in, projects, chat) would go
// down with it. Sandbox routes report an unreachable orchestrator on their own.
export async function getReadyCheckHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const report = await checkReadiness({
    postgres: () => prisma.$queryRaw`SELECT 1`,
    redis: () =>
      Promise.all([
        checkRedisConnection(cacheRedis),
        checkRedisConnection(eventsRedis),
      ]),
  })
  if (!report.ready)
    request.log.warn(
      { checks: report.checks, errors: report.errors },
      "not ready",
    )

  const { status, body } = readinessResponse(report)
  return reply.status(status).send(body)
}
