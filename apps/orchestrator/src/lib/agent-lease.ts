import {
  AGENT_PROJECT_LEASE_HEADER,
  agentProjectLockKey,
} from "@forgeAI/shared"
import type { FastifyReply, FastifyRequest } from "fastify"

import { redisCommands } from "./redis.js"

export function projectLeaseToken(request: FastifyRequest): string | undefined {
  const value = request.headers[AGENT_PROJECT_LEASE_HEADER]
  return Array.isArray(value) ? value[0] : value
}

export async function requireCurrentProjectLease(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
): Promise<boolean> {
  const token = projectLeaseToken(request)
  if (!token) {
    await reply
      .status(409)
      .send({ error: "Agent project lease is required for this operation." })
    return false
  }

  try {
    const current = await redisCommands.get(agentProjectLockKey(projectId))
    if (current === token) return true
  } catch (error) {
    request.log.warn(
      { err: error, projectId },
      "agent project lease check failed",
    )
  }

  await reply.status(409).send({
    error: "Agent project lease was lost. Stop this run and retry.",
  })
  return false
}
