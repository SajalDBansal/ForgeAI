import { prisma } from "@forgeAI/database"

import { ENV_CONFIG } from "../lib/envConfig.js"
import { projectAccessFilter } from "./build.service.js"

type ModelUsageKind = "LLM_TOKENS" | "EMBEDDING_TOKENS"

const MODEL_KINDS: ModelUsageKind[] = ["LLM_TOKENS", "EMBEDDING_TOKENS"]

function startOfUtcDay(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}

function startOfUtcMonth(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function daysAgoUtc(days: number): Date {
  const day = startOfUtcDay()
  day.setUTCDate(day.getUTCDate() - days)
  return day
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function microsToDollars(micros: number): number {
  return micros / 1_000_000
}

async function sumCost(
  where: Parameters<typeof prisma.usageEvent.aggregate>[0]["where"],
): Promise<number> {
  const total = await prisma.usageEvent.aggregate({
    where,
    _sum: { costMicros: true },
  })
  return total._sum.costMicros ?? 0
}

export type AgentBudgetResult =
  | { ok: true }
  | {
      ok: false
      reason: "daily" | "monthly"
      message: string
      usedMicros: number
      limitMicros: number
    }

// Checks model/RAG spend before a new agent message is accepted. Sandbox-hours keep their own
// budget in orchestrator; this one is dollars, so the units stay legible.
export async function checkAgentModelBudget(
  userId: string,
  projectId: string,
): Promise<AgentBudgetResult> {
  const project = await prisma.project.findFirst({
    where: projectAccessFilter(userId, projectId, "write"),
    select: { workspace: { select: { userId: true } } },
  })
  if (!project) return { ok: true }

  const dailyLimit = ENV_CONFIG.AGENT_DAILY_BUDGET_MICROS
  if (dailyLimit > 0) {
    const used = await sumCost({
      kind: { in: MODEL_KINDS },
      createdAt: { gte: startOfUtcDay() },
    })
    if (used >= dailyLimit) {
      return {
        ok: false,
        reason: "daily",
        usedMicros: used,
        limitMicros: dailyLimit,
        message: `Model usage is paused until tomorrow. Today's $${microsToDollars(dailyLimit).toFixed(2)} limit has been reached.`,
      }
    }
  }

  const monthlyLimit = ENV_CONFIG.AGENT_OWNER_MONTHLY_BUDGET_MICROS
  if (monthlyLimit > 0) {
    const used = await sumCost({
      kind: { in: MODEL_KINDS },
      workspace: { userId: project.workspace.userId },
      createdAt: { gte: startOfUtcMonth() },
    })
    if (used >= monthlyLimit) {
      return {
        ok: false,
        reason: "monthly",
        usedMicros: used,
        limitMicros: monthlyLimit,
        message: `Model usage is paused for this workspace owner. This month's $${microsToDollars(monthlyLimit).toFixed(2)} limit has been reached.`,
      }
    }
  }

  return { ok: true }
}

export interface UsageSummary {
  dailyBudgetMicros: number | null
  ownerMonthlyBudgetMicros: number | null
  today: { costMicros: number; tokensIn: number; tokensOut: number }
  month: {
    costMicros: number
    tokensIn: number
    tokensOut: number
    agentRuns: number
    projects: number
  }
  byDay: { day: string; costMicros: number; tokens: number }[]
  recent: {
    key: string
    at: string
    project: string
    action: string
    tokens: number
    costMicros: number
    models: string[]
  }[]
}

export async function usageSummary(userId: string): Promise<UsageSummary> {
  const today = startOfUtcDay()
  const month = startOfUtcMonth()
  const since = daysAgoUtc(29)
  const whereOwned = {
    workspace: { userId },
    kind: { in: MODEL_KINDS },
  } as const

  const [todayTotals, monthRows, chartRows, recentRows] = await Promise.all([
    prisma.usageEvent.aggregate({
      where: { ...whereOwned, createdAt: { gte: today } },
      _sum: { costMicros: true, tokensIn: true, tokensOut: true },
    }),
    prisma.usageEvent.findMany({
      where: { ...whereOwned, createdAt: { gte: month } },
      select: {
        createdAt: true,
        projectId: true,
        runId: true,
        costMicros: true,
        tokensIn: true,
        tokensOut: true,
      },
    }),
    prisma.usageEvent.findMany({
      where: { ...whereOwned, createdAt: { gte: since } },
      select: {
        createdAt: true,
        costMicros: true,
        tokensIn: true,
        tokensOut: true,
      },
    }),
    prisma.usageEvent.findMany({
      where: { ...whereOwned, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { project: { select: { name: true } } },
    }),
  ])

  const byDay = new Map<
    string,
    { day: string; costMicros: number; tokens: number }
  >()
  for (let i = 0; i < 30; i += 1) {
    const day = addDays(since, i).toISOString().slice(0, 10)
    byDay.set(day, { day, costMicros: 0, tokens: 0 })
  }
  // Chart totals cover the whole period; only the activity list is capped.
  for (const row of chartRows) {
    const day = row.createdAt.toISOString().slice(0, 10)
    const bucket = byDay.get(day)
    if (!bucket) continue
    bucket.costMicros += row.costMicros
    bucket.tokens += row.tokensIn + row.tokensOut
  }

  const recent = new Map<string, UsageSummary["recent"][number]>()
  for (const row of recentRows) {
    const key = row.runId ?? row.id
    const item =
      recent.get(key) ??
      ({
        key,
        at: row.createdAt.toISOString(),
        project: row.project?.name ?? "Deleted project",
        action: row.runId
          ? `Agent run ${row.runId.slice(0, 8)}`
          : row.kind === "EMBEDDING_TOKENS"
            ? "Knowledge graph embeddings"
            : "Model call",
        tokens: 0,
        costMicros: 0,
        models: [],
      } satisfies UsageSummary["recent"][number])
    item.tokens += row.tokensIn + row.tokensOut
    item.costMicros += row.costMicros
    if (row.model && !item.models.includes(row.model))
      item.models.push(row.model)
    recent.set(key, item)
  }

  return {
    dailyBudgetMicros: ENV_CONFIG.AGENT_DAILY_BUDGET_MICROS || null,
    ownerMonthlyBudgetMicros:
      ENV_CONFIG.AGENT_OWNER_MONTHLY_BUDGET_MICROS || null,
    today: {
      costMicros: todayTotals._sum.costMicros ?? 0,
      tokensIn: todayTotals._sum.tokensIn ?? 0,
      tokensOut: todayTotals._sum.tokensOut ?? 0,
    },
    month: {
      costMicros: monthRows.reduce((sum, row) => sum + row.costMicros, 0),
      tokensIn: monthRows.reduce((sum, row) => sum + row.tokensIn, 0),
      tokensOut: monthRows.reduce((sum, row) => sum + row.tokensOut, 0),
      agentRuns: new Set(monthRows.map((row) => row.runId).filter(Boolean))
        .size,
      projects: new Set(monthRows.map((row) => row.projectId).filter(Boolean))
        .size,
    },
    byDay: [...byDay.values()],
    recent: [...recent.values()].slice(0, 20),
  }
}
