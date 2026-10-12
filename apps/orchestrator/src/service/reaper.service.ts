import { ENV_CONFIG } from "../envConfig.js"
import { countWatchers } from "../lib/presence.js"
import { publishSandboxEvent } from "../lib/redis.js"
import { countSandboxes, getPodStartedAt, listPods } from "../state.js"
import { provider } from "../lib/provider.js"
import { holdPod } from "./activity.service.js"
import {
  activeProjectWork,
  beginProjectRetirement,
} from "./active-work.service.js"
import { isDevServerRunning } from "./dev.service.js"
import { destroyPod, recyclePod } from "./sandbox.service.js"
import { snapshotProject } from "./snapshot.service.js"
import { isTerminalOpen } from "./terminal.service.js"

/** How often every pod is checked; also the granularity of every deadline below. */
const TICK_MS = 60_000

const IDLE_WARNING_MS = ENV_CONFIG.SANDBOX_IDLE_WARNING_MINUTES * 60_000

/** How long a reap/recycle gives in-flight sandbox work to leave cleanly. */
const ACTIVE_WORK_DRAIN_MS = 30_000

// ---------- PRESSURE: REAP SOONER WHEN NEARLY FULL (capacity §7.5, E11) ----------

/** How long an unwatched / open-but-idle sandbox may stay, at one level of plan usage. */
export interface ReapTimings {
  level: "normal" | "high" | "critical"
  unwatchedMs: number
  idleMs: number
}

const minutes = (n: number) => n * 60_000

// Picks the reap timings for how full the plan is: `held` sandboxes (running + opening) of
// `usable` slots. Idle sandboxes are the cheapest room to free, so they go sooner as it fills.
export function reapTimings(held: number, usable: number): ReapTimings {
  const percent = (held / usable) * 100
  if (percent > ENV_CONFIG.SANDBOX_PRESSURE_CRITICAL_PERCENT) {
    return {
      level: "critical",
      unwatchedMs: minutes(
        ENV_CONFIG.SANDBOX_PRESSURE_CRITICAL_UNWATCHED_MINUTES,
      ),
      idleMs: minutes(ENV_CONFIG.SANDBOX_PRESSURE_CRITICAL_IDLE_MINUTES),
    }
  }
  if (percent > ENV_CONFIG.SANDBOX_PRESSURE_HIGH_PERCENT) {
    return {
      level: "high",
      unwatchedMs: minutes(ENV_CONFIG.SANDBOX_PRESSURE_HIGH_UNWATCHED_MINUTES),
      idleMs: minutes(ENV_CONFIG.SANDBOX_PRESSURE_HIGH_IDLE_MINUTES),
    }
  }
  return {
    level: "normal",
    unwatchedMs: minutes(ENV_CONFIG.SANDBOX_UNWATCHED_REAP_MINUTES),
    idleMs: minutes(ENV_CONFIG.SANDBOX_IDLE_REAP_MINUTES),
  }
}

// Decides what to do with an open-but-idle sandbox. `warnedFor` is how long ago its tab was warned
// (undefined if not yet). The tab always gets the full warning before shutdown, even when
// pressure suddenly shortens the idle limit; activity again withdraws the warning.
export function idleDecision(
  idleFor: number,
  idleMs: number,
  warnedFor: number | undefined,
): "keep" | "cancel" | "warn" | "reap" {
  if (idleFor < idleMs - IDLE_WARNING_MS)
    return warnedFor === undefined ? "keep" : "cancel"
  if (warnedFor === undefined) return "warn"
  return idleFor >= idleMs && warnedFor >= IDLE_WARNING_MS ? "reap" : "keep"
}

/** The level of the last sweep, so a change is logged once. */
let lastLevel: ReapTimings["level"] = "normal"

/**
 * The provider's lifetime cap (F6): on E2B the plan's, 60 minutes on Hobby, 24 hours on Pro.
 * null when the provider has none, and then sandboxes are never recycled.
 */
const LIFETIME_MINUTES =
  provider.capabilities.maxLifetimeMs === null
    ? null
    : provider.capabilities.maxLifetimeMs / 60_000

/** Age at which a sandbox is replaced: the lifetime cap minus a margin for save + recreate. */
const RECYCLE_AT_MS =
  LIFETIME_MINUTES === null
    ? null
    : (LIFETIME_MINUTES - ENV_CONFIG.SANDBOX_RECYCLE_MARGIN_MINUTES) * 60_000

// Refuse a config that would recycle every sandbox every minute.
if (RECYCLE_AT_MS !== null && RECYCLE_AT_MS < 5 * 60_000) {
  throw new Error(
    `SANDBOX_RECYCLE_MARGIN_MINUTES (${ENV_CONFIG.SANDBOX_RECYCLE_MARGIN_MINUTES}) must leave at least 5 minutes of the plan's ${LIFETIME_MINUTES}-minute lifetime`,
  )
}

/** When each project was first seen with nobody watching (a refresh briefly empties presence). */
const unwatchedSince = new Map<string, number>()

/** When each project's tab was warned about an idle shutdown, so it's sent once and honoured. */
const warned = new Map<string, number>()

// Clears the reaper's bookkeeping for a project.
// Called after a reap/recycle and when a pod goes away for other reasons.
function forget(projectId: string): void {
  unwatchedSince.delete(projectId)
  warned.delete(projectId)
}

function workSummary(projectId: string): string {
  const work = activeProjectWork(projectId)
  return work.length
    ? work.map((record) => `${record.kind}:${record.label}`).join(", ")
    : "no tracked active work"
}

async function retireProject(
  projectId: string,
  why: string,
  work: () => Promise<void>,
): Promise<boolean> {
  const retirement = beginProjectRetirement(projectId, why)
  if (!retirement.started) {
    holdPod(projectId)
    return false
  }

  try {
    const drained = await retirement.waitForDrain(ACTIVE_WORK_DRAIN_MS)
    if (!drained) {
      holdPod(projectId)
      console.log(
        `[reaper] delayed ${projectId}'s sandbox retirement (${why}); still active: ${workSummary(projectId)}`,
      )
      return false
    }

    await work()
    return true
  } finally {
    retirement.finish()
  }
}

// Shuts a sandbox down, but only after a forced snapshot verifies in R2.
// On a failed save the sandbox is kept alive and retried next tick.
async function reap(projectId: string, why: string): Promise<void> {
  await retireProject(projectId, why, async () => {
    // Forced: the in-memory dirty flag can't vouch for a re-adopted sandbox.
    const saved = await snapshotProject(projectId, true)

    if (!saved.ok) {
      // Keep it alive ourselves, or E2B's own clock would kill it unsaved.
      holdPod(projectId)
      console.error(
        `[reaper] keeping ${projectId}'s sandbox: its snapshot did not complete (${saved.reason}${saved.detail ? ` — ${saved.detail}` : ""})`,
      )
      return
    }

    forget(projectId)
    await destroyPod(projectId)
    publishSandboxEvent({ type: "sandbox.reaped", projectId })
    console.log(`[reaper] shut down ${projectId}'s sandbox: ${why}`)
  })
}

// Checks whether a sandbox is close to E2B's hard lifetime cap.
// Such sandboxes are saved and replaced (or reaped) before E2B kills them.
function isNearLifetimeCap(projectId: string): boolean {
  if (RECYCLE_AT_MS === null) return false
  const startedAt = getPodStartedAt(projectId)
  return startedAt !== undefined && Date.now() - startedAt >= RECYCLE_AT_MS
}

// Reaps an ageing sandbox nobody has open, or replaces it with a fresh one if someone does.
// Replacement is a normal restart, so it never proceeds without a verified save.
async function retireAgeingPod(
  projectId: string,
  watchers: number | undefined,
): Promise<void> {
  const limit = LIFETIME_MINUTES
  if (watchers === 0) {
    await reap(
      projectId,
      `it is close to E2B's ${limit}-minute limit and nobody has it open`,
    )
    return
  }
  try {
    await retireProject(
      projectId,
      `it is close to E2B's ${limit}-minute limit`,
      async () => {
        forget(projectId)
        await recyclePod(projectId)
        console.log(
          `[reaper] replaced ${projectId}'s sandbox before E2B's ${limit}-minute limit`,
        )
      },
    )
  } catch (error) {
    // The save failed, so nothing was replaced; keep it up and retry next tick.
    holdPod(projectId)
    console.error(
      `[reaper] could not replace ${projectId}'s ageing sandbox:`,
      error,
    )
  }
}

// Reaps a sandbox once nobody has had it open for the unwatched window.
// Until then it is kept alive so a refresh or tab switch never trips it.
async function handleUnwatched(
  projectId: string,
  timings: ReapTimings,
): Promise<void> {
  const since = unwatchedSince.get(projectId) ?? Date.now()
  unwatchedSince.set(projectId, since)

  if (Date.now() - since >= timings.unwatchedMs) {
    await reap(
      projectId,
      `nobody has had it open for ${timings.unwatchedMs / 60_000} minutes (${timings.level} usage)`,
    )
    return
  }

  holdPod(projectId)
}

// Warns, then reaps, a sandbox that is open in a tab but untouched for a long time.
// Clears any earlier warning as soon as there is activity again.
async function handleIdle(
  projectId: string,
  lastUsedAt: Date,
  timings: ReapTimings,
): Promise<void> {
  const now = Date.now()
  const idleFor = now - lastUsedAt.getTime()
  const warnedAt = warned.get(projectId)

  switch (
    idleDecision(
      idleFor,
      timings.idleMs,
      warnedAt === undefined ? undefined : now - warnedAt,
    )
  ) {
    case "reap":
      await reap(
        projectId,
        `open but untouched for ${Math.round(idleFor / 60_000)} minutes (${timings.level} usage)`,
      )
      return
    case "warn":
      warned.set(projectId, now)
      publishSandboxEvent({
        type: "sandbox.expiring",
        projectId,
        // Never sooner than a full warning from now.
        reapAt: new Date(
          Math.max(
            lastUsedAt.getTime() + timings.idleMs,
            now + IDLE_WARNING_MS,
          ),
        ).toISOString(),
      })
      return
    case "cancel":
      cancelWarning(projectId)
      return
    case "keep":
      return
  }
}

// Decides what to do with one pod: recycle, reap, warn, or keep alive.
// Unwatched pods go quickly; open-but-idle ones get longer; a running dev server counts as use.
async function consider(
  projectId: string,
  lastUsedAt: Date,
  timings: ReapTimings,
): Promise<void> {
  const watchers = await countWatchers(projectId)

  if (isTerminalOpen(projectId)) {
    holdPod(projectId)
    cancelWarning(projectId)
    return
  }

  if (isNearLifetimeCap(projectId)) {
    await retireAgeingPod(projectId, watchers)
    return
  }

  // Unknown is not "nobody": never reap because Redis didn't answer.
  if (watchers === undefined) {
    holdPod(projectId)
    return
  }

  if (watchers === 0) {
    await handleUnwatched(projectId, timings)
    return
  }

  unwatchedSince.delete(projectId)
  holdPod(projectId)

  // A live preview is somebody using the project, whatever the keyboard says.
  if (isDevServerRunning(projectId)) {
    cancelWarning(projectId)
    return
  }

  await handleIdle(projectId, lastUsedAt, timings)
}

// Withdraws an idle warning once somebody does something.
// Only sent to projects that were warned, so normal sessions never see it.
function cancelWarning(projectId: string): void {
  if (!warned.delete(projectId)) return
  publishSandboxEvent({ type: "sandbox.expiring", projectId, reapAt: null })
}

// Checks every pod this process holds, one at a time.
// Sequential because reaping tars and uploads a project; exported to force a sweep in tests.
export async function sweepOnce(): Promise<void> {
  const { running, opening } = countSandboxes()
  const usable = ENV_CONFIG.SANDBOX_PLAN.usable
  const timings = reapTimings(running + opening, usable)
  if (timings.level !== lastLevel) {
    console.log(
      `[reaper] ${running + opening} of ${usable} usable sandboxes in use: ${timings.level} usage, idle sandboxes now go after ${timings.unwatchedMs / 60_000} min unwatched / ${timings.idleMs / 60_000} min idle`,
    )
    lastLevel = timings.level
  }

  for (const [projectId, pod] of listPods()) {
    try {
      await consider(projectId, pod.lastUsedAt, timings)
    } catch (error) {
      console.error(`[reaper] could not consider ${projectId}:`, error)
    }
  }
}

let running = false

// Starts the once-a-minute sweep, skipping a tick if the last one is still running.
// Called at boot; the timer never keeps the process alive on its own.
export function startReaper(): void {
  setInterval(() => {
    if (running) return
    running = true
    void sweepOnce().finally(() => {
      running = false
    })
  }, TICK_MS).unref()
}

// Clears the reaper's bookkeeping for a pod that went away for another reason.
// Called from sandbox.service when a pod is released.
export function forgetReaperState(projectId: string): void {
  forget(projectId)
}
