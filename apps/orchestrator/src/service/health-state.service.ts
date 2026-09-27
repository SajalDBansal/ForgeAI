import { monitorEventLoopDelay } from "node:perf_hooks"
import { getHeapStatistics } from "node:v8"

import { ENV_CONFIG } from "../envConfig.js"

// Whether this orchestrator is healthy enough to take NEW projects (capacity §4.3, work plan E17).
// It measures event-loop lag and heap use; sustained overload makes it BUSY, which refuses new
// sandboxes with "busy" until it recovers. Existing projects, typing and terminals are never
// blocked, and /readyz stays healthy: with one orchestrator, failing it would cut everyone off.

/** How often lag and heap are measured. */
const SAMPLE_MS = 5_000
/** How long overload (or recovery) must last before the state changes, so one spike doesn't flip it. */
const SUSTAIN_MS = 30_000

export type HealthState = "READY" | "BUSY"

/** The state, and since when the measurements have been over (or under) the limits. */
export interface HealthTracker {
  state: HealthState
  overSince?: number
  underSince?: number
}

// Works out the next state from one measurement: BUSY after SUSTAIN_MS over the limits, READY
// after SUSTAIN_MS back under. Pure, so the timing rules are easy to check.
export function nextHealthState(
  tracker: HealthTracker,
  over: boolean,
  now: number,
): HealthTracker {
  if (over) {
    const overSince = tracker.overSince ?? now
    return {
      state: now - overSince >= SUSTAIN_MS ? "BUSY" : tracker.state,
      overSince,
    }
  }
  const underSince = tracker.underSince ?? now
  return {
    state: now - underSince >= SUSTAIN_MS ? "READY" : tracker.state,
    underSince,
  }
}

const loopDelay = monitorEventLoopDelay({ resolution: 20 })
let tracker: HealthTracker = { state: "READY" }
let latest = { lagMs: 0, heapPercent: 0 }

// Measures once: the worst (p99) event-loop delay since the last sample, and heap use against the
// heap's limit. Updates the state and logs a change once.
function sample(): void {
  const lagMs = loopDelay.percentile(99) / 1_000_000
  loopDelay.reset()
  const heap = getHeapStatistics()
  const heapPercent = (heap.used_heap_size / heap.heap_size_limit) * 100
  latest = {
    lagMs: Math.round(lagMs),
    heapPercent: Math.round(heapPercent * 10) / 10,
  }

  const over =
    lagMs > ENV_CONFIG.ORCHESTRATOR_MAX_EVENT_LOOP_LAG_MS ||
    heapPercent > ENV_CONFIG.ORCHESTRATOR_MAX_HEAP_PERCENT
  const next = nextHealthState(tracker, over, Date.now())
  if (next.state !== tracker.state) {
    console.warn(
      next.state === "BUSY"
        ? `[health] BUSY: event-loop lag ${latest.lagMs} ms, heap ${latest.heapPercent}% for 30 s; new projects get "busy" until it recovers`
        : `[health] READY again: event-loop lag ${latest.lagMs} ms, heap ${latest.heapPercent}%`,
    )
  }
  tracker = next
}

// Starts measuring. Called once at start-up; the timer never keeps the process alive.
export function startHealthMonitor(): void {
  loopDelay.enable()
  setInterval(sample, SAMPLE_MS).unref()
}

// READY or BUSY, for the capacity check.
export function getHealthState(): HealthState {
  return tracker.state
}

// The state and the latest measurements, for /internal/capacity.
export function healthReport(): {
  state: HealthState
  eventLoopLagMs: number
  heapPercent: number
} {
  return {
    state: tracker.state,
    eventLoopLagMs: latest.lagMs,
    heapPercent: latest.heapPercent,
  }
}
