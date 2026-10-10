import { ENV_CONFIG } from "../envConfig.js"
import { redisCommands } from "../lib/redis.js"
import { getPodOwner, listPods } from "../state.js"

// Counts sandbox time (capacity §6, work plan E12): every minute, each running sandbox adds 60 s
// to today's total for the account and to its owner's total for the month. The totals live in
// Redis so a restart doesn't reset them; the environment is in the key so environments sharing
// one Redis never mix. Accurate to about a minute; the exact history for billing is E13.

/** How often running sandboxes are counted. */
const TICK_MS = 60_000
const DAY_KEY_TTL_SECONDS = 3 * 24 * 3600
const MONTH_KEY_TTL_SECONDS = 40 * 24 * 3600

const prefix = `cap:${ENV_CONFIG.SANDBOX_ENVIRONMENT}`

/** UTC day and month, as used in the keys. */
const today = () => new Date().toISOString().slice(0, 10)
const thisMonth = () => new Date().toISOString().slice(0, 7)

/** Today's account total (seconds), in Redis. */
export const dayKey = (day = today()) => `${prefix}:seconds:${day}`
/** An owner's total for the month (seconds), in Redis. Counted now, limited once billing exists. */
export const ownerMonthKey = (ownerId: string, month = thisMonth()) =>
  `${prefix}:owner:${ownerId}:seconds:${month}`

/**
 * Today's total kept in memory, so the budget check (E6's synchronous check) never waits on
 * Redis. Only this orchestrator writes the counter, so the copy stays current.
 */
let spent = { day: today(), seconds: 0 }
let warnedDay = ""

// Seconds of sandbox time used today, for the budget check and the capacity route.
export function spentTodaySeconds(): number {
  return spent.day === today() ? spent.seconds : 0
}

// The daily budget in seconds, or undefined when there is none (SANDBOX_DAILY_BUDGET_HOURS = 0).
export function dailyBudgetSeconds(): number | undefined {
  const hours = ENV_CONFIG.SANDBOX_DAILY_BUDGET_HOURS
  return hours > 0 ? hours * 3600 : undefined
}

// Whether today's budget is used up, so new sandboxes wait until tomorrow (running ones never stop).
export function isBudgetReached(): boolean {
  const budget = dailyBudgetSeconds()
  return budget !== undefined && spentTodaySeconds() >= budget
}

// Logs once a day when usage passes the warning share of the budget.
function warnIfNearBudget(): void {
  const budget = dailyBudgetSeconds()
  if (budget === undefined || warnedDay === spent.day) return
  const percent = (spent.seconds / budget) * 100
  if (percent < ENV_CONFIG.SANDBOX_BUDGET_WARN_PERCENT) return
  warnedDay = spent.day
  console.warn(
    `[spend] ${(spent.seconds / 3600).toFixed(1)} of today's ${ENV_CONFIG.SANDBOX_DAILY_BUDGET_HOURS} sandbox-hours used (${Math.round(percent)}%)`,
  )
}

// Adds one minute for every running sandbox: to today's total and to each owner's month.
async function countRunningSandboxes(): Promise<void> {
  const running = listPods().map(([projectId]) => projectId)
  if (running.length === 0) return

  const perOwner = new Map<string, number>()
  for (const projectId of running) {
    const owner = getPodOwner(projectId)
    if (owner) perOwner.set(owner, (perOwner.get(owner) ?? 0) + 1)
  }

  const day = today()
  const step = redisCommands
    .multi()
    .incrby(dayKey(day), running.length * 60)
    .expire(dayKey(day), DAY_KEY_TTL_SECONDS)
  for (const [owner, count] of perOwner) {
    step
      .incrby(ownerMonthKey(owner), count * 60)
      .expire(ownerMonthKey(owner), MONTH_KEY_TTL_SECONDS)
  }
  const results = await step.exec()
  const total = Number(results?.[0]?.[1])
  if (Number.isFinite(total)) spent = { day, seconds: total }
  warnIfNearBudget()
}

// Starts counting: reads today's total once, then counts every minute. If Redis is down, counting
// pauses with a log line and the budget check uses the last known total.
export async function startSpendCounter(): Promise<void> {
  try {
    const stored = Number(await redisCommands.get(dayKey()))
    spent = { day: today(), seconds: Number.isFinite(stored) ? stored : 0 }
  } catch (error) {
    console.error(
      "[spend] could not read today's total; starting from 0:",
      error,
    )
  }

  setInterval(() => {
    countRunningSandboxes().catch((error) =>
      console.error("[spend] could not count running sandboxes:", error),
    )
  }, TICK_MS).unref()
}
