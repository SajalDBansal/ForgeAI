import type { FastifyReply, FastifyRequest } from "fastify"

import { ENV_CONFIG } from "../envConfig.js"
import { healthReport } from "../service/health-state.service.js"
import {
  dailyBudgetSeconds,
  spentTodaySeconds,
} from "../service/spend.service.js"
import { countSandboxes } from "../state.js"

// GET /internal/capacity: what this orchestrator holds, against its own limits and the plan's.
// Token-protected like every non-probe route; for operators (curl, port-forward), not browsers.
export async function capacityHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  const plan = ENV_CONFIG.SANDBOX_PLAN
  const { running, opening } = countSandboxes()

  return reply.send({
    environment: ENV_CONFIG.SANDBOX_ENVIRONMENT,
    orchestrator: {
      id: ENV_CONFIG.ORCHESTRATOR_ID,
      target: ENV_CONFIG.ORCHESTRATOR_TARGET_SANDBOXES,
      max: ENV_CONFIG.ORCHESTRATOR_MAX_SANDBOXES,
      running,
      opening,
      /** READY, or BUSY when overloaded (new projects get "busy"); plus the latest measurements. */
      health: healthReport(),
    },
    plan: {
      name: plan.name,
      maxConcurrent: plan.maxConcurrent,
      reserve: plan.reserve,
      usable: plan.usable,
      maxCreatesPerSecond: plan.maxCreatesPerSecond,
      maxLifetimeMinutes: plan.maxLifetimeMinutes,
    },
    spend: {
      todayHours: Math.round((spentTodaySeconds() / 3600) * 100) / 100,
      /** null when there's no daily budget. */
      budgetHours:
        dailyBudgetSeconds() === undefined
          ? null
          : ENV_CONFIG.SANDBOX_DAILY_BUDGET_HOURS,
    },
  })
}
