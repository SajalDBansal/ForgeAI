// What our E2B plan allows, in one place every service reads (capacity doc §3). Changing plan is
// one setting, SANDBOX_PLAN; the numbers below come from E2B's pricing page, so re-check them
// when the plan changes.

/** One E2B plan's limits. */
export interface SandboxPlanProfile {
  name: string
  /** Sandboxes E2B lets the whole account run at once. */
  maxConcurrent: number
  /** New sandboxes per second (create, restore and recycle all count). */
  maxCreatesPerSecond: number
  /** E2B kills a sandbox this long after it was created; we save and replace it before then. */
  maxLifetimeMinutes: number
  maxVcpuPerSandbox: number
  maxMemoryMbPerSandbox: number
  maxDiskMbPerSandbox: number
}

/** E2B's plans. Hobby is what we use today and the default. */
export const SANDBOX_PLANS = {
  hobby: {
    name: "hobby",
    maxConcurrent: 20,
    maxCreatesPerSecond: 1,
    maxLifetimeMinutes: 60,
    maxVcpuPerSandbox: 8,
    maxMemoryMbPerSandbox: 8192,
    maxDiskMbPerSandbox: 10240,
  },
  pro: {
    name: "pro",
    maxConcurrent: 100,
    maxCreatesPerSecond: 5,
    maxLifetimeMinutes: 1440,
    maxVcpuPerSandbox: 8,
    maxMemoryMbPerSandbox: 8192,
    maxDiskMbPerSandbox: 20480,
  },
  "pro-600": {
    name: "pro-600",
    maxConcurrent: 600,
    maxCreatesPerSecond: 5,
    maxLifetimeMinutes: 1440,
    maxVcpuPerSandbox: 8,
    maxMemoryMbPerSandbox: 8192,
    maxDiskMbPerSandbox: 20480,
  },
  "pro-1100": {
    name: "pro-1100",
    maxConcurrent: 1100,
    maxCreatesPerSecond: 5,
    maxLifetimeMinutes: 1440,
    maxVcpuPerSandbox: 8,
    maxMemoryMbPerSandbox: 8192,
    maxDiskMbPerSandbox: 20480,
  },
} as const satisfies Record<string, SandboxPlanProfile>

/** The plan in effect, plus how many sandboxes users may actually have. */
export interface SandboxPlan extends SandboxPlanProfile {
  /** Slots kept free for recycling, restarts and testing; never given to users. */
  reserve: number
  /** maxConcurrent − reserve: the most sandboxes users get at once. */
  usable: number
}

/** Settings that override one profile number (for a negotiated limit, or `custom`). */
const OVERRIDES: Record<string, keyof Omit<SandboxPlanProfile, "name">> = {
  SANDBOX_PLAN_MAX_CONCURRENT: "maxConcurrent",
  SANDBOX_PLAN_CREATES_PER_SECOND: "maxCreatesPerSecond",
  SANDBOX_PLAN_LIFETIME_MINUTES: "maxLifetimeMinutes",
  SANDBOX_PLAN_VCPU: "maxVcpuPerSandbox",
  SANDBOX_PLAN_MEMORY_MB: "maxMemoryMbPerSandbox",
  SANDBOX_PLAN_DISK_MB: "maxDiskMbPerSandbox",
}

// Reads a setting that must be a whole number of at least `min`; undefined when unset.
function wholeNumber(
  env: Record<string, string | undefined>,
  name: string,
  min = 1,
): number | undefined {
  const raw = env[name]
  if (raw === undefined || raw === "") return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min)
    throw new Error(
      `${name} must be a whole number of at least ${min} (got "${raw}")`,
    )
  return value
}

// Works out the plan from SANDBOX_PLAN (default hobby), any SANDBOX_PLAN_* overrides and
// SANDBOX_PLAN_RESERVE. Throws on an unknown plan, on `custom` without every number, or on a
// reserve that leaves no room, so a wrong setting stops start-up instead of misbehaving later.
export function resolveSandboxPlan(
  env: Record<string, string | undefined> = process.env,
): SandboxPlan {
  const name = env.SANDBOX_PLAN || "hobby"
  const known =
    name in SANDBOX_PLANS
      ? SANDBOX_PLANS[name as keyof typeof SANDBOX_PLANS]
      : undefined
  if (!known && name !== "custom") {
    throw new Error(
      `SANDBOX_PLAN "${name}" is unknown; use one of: ${[...Object.keys(SANDBOX_PLANS), "custom"].join(", ")}`,
    )
  }

  const profile: Partial<SandboxPlanProfile> = { ...known, name }
  for (const [setting, field] of Object.entries(OVERRIDES)) {
    const value = wholeNumber(env, setting)
    if (value !== undefined) profile[field] = value
  }
  const missing = Object.entries(OVERRIDES)
    .filter(([, field]) => profile[field] === undefined)
    .map(([setting]) => setting)
  if (missing.length)
    throw new Error(
      `SANDBOX_PLAN=custom needs every limit set; missing: ${missing.join(", ")}`,
    )

  const complete = profile as SandboxPlanProfile
  // 0 is allowed (handy for testing); by default at least 2 stay free for recycling and restarts.
  const reserve =
    wholeNumber(env, "SANDBOX_PLAN_RESERVE", 0) ??
    Math.max(2, Math.ceil(complete.maxConcurrent * 0.05))
  if (reserve >= complete.maxConcurrent) {
    throw new Error(
      `SANDBOX_PLAN_RESERVE (${reserve}) must be below the plan's ${complete.maxConcurrent} concurrent sandboxes`,
    )
  }
  return { ...complete, reserve, usable: complete.maxConcurrent - reserve }
}

// One line describing the plan, logged by every service at start-up so a mismatch is easy to spot.
export function describeSandboxPlan(plan: SandboxPlan): string {
  return `plan=${plan.name} usable=${plan.usable} (concurrent ${plan.maxConcurrent}, reserve ${plan.reserve}, creates/s ${plan.maxCreatesPerSecond}, lifetime ${plan.maxLifetimeMinutes} min)`
}
