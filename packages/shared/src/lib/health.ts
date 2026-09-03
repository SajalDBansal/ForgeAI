/** What a readiness check found for one dependency. */
export type DependencyState = "ok" | "down" | "timeout"

export interface ReadinessReport {
  ready: boolean
  checks: Record<string, DependencyState>
  /** Why each failing check failed. For logs only: it can name hosts and ports. */
  errors: Record<string, string>
}

/** The /readyz body every service sends. */
export interface ReadinessBody {
  status: "ready" | "not_ready"
  checks: Record<string, DependencyState>
}

/** Time limit per check: a dependency that hangs is as unready as one that refuses. */
export const READINESS_CHECK_TIMEOUT_MS = 2_000

let shuttingDown = false

// Marks this process as shutting down: /readyz answers 503 from now on, so the load balancer
// stops sending new work here before the process stops taking it. Called first on SIGTERM.
export function beginShutdown(): void {
  shuttingDown = true
}

// Runs every named check at once, each limited to timeoutMs; ready only when all pass.
// Shared by the services' /readyz, so they all report the same way.
export async function checkReadiness(
  checks: Record<string, () => Promise<unknown>>,
  timeoutMs = READINESS_CHECK_TIMEOUT_MS,
): Promise<ReadinessReport> {
  if (shuttingDown)
    return {
      ready: false,
      checks: { shutdown: "down" },
      errors: { shutdown: "shutting down" },
    }

  const results = await Promise.all(
    Object.entries(checks).map(
      async ([name, run]): Promise<[string, DependencyState, string?]> => {
        let timer: ReturnType<typeof setTimeout> | undefined
        const timedOut = new Promise<"timeout">((resolve) => {
          timer = setTimeout(() => resolve("timeout"), timeoutMs)
        })
        try {
          const state = await Promise.race([
            run().then(() => "ok" as const),
            timedOut,
          ])
          return state === "timeout"
            ? [name, state, `no answer within ${timeoutMs} ms`]
            : [name, state]
        } catch (error) {
          return [
            name,
            "down",
            error instanceof Error ? error.message : String(error),
          ]
        } finally {
          clearTimeout(timer)
        }
      },
    ),
  )

  // Assembled in the order the checks were given, so every answer reads the same way.
  const report: ReadinessReport = { ready: true, checks: {}, errors: {} }
  for (const [name, state, error] of results) {
    report.checks[name] = state
    if (error) report.errors[name] = error
    if (state !== "ok") report.ready = false
  }
  return report
}

// Turns a report into the /readyz body and status code (200 ready, 503 not).
// The errors stay out of the body; callers log them.
export function readinessResponse(report: ReadinessReport): {
  status: 200 | 503
  body: ReadinessBody
} {
  return {
    status: report.ready ? 200 : 503,
    body: {
      status: report.ready ? "ready" : "not_ready",
      checks: report.checks,
    },
  }
}

/** The parts of an ioredis client a readiness check uses; structural, so this package needn't depend on ioredis. */
export interface PingableRedis {
  status: string
  ping(): Promise<unknown>
}

// Checks one Redis connection is up and, unless it's a subscriber (which can't run commands), answering.
// A lazy client that hasn't connected yet ("wait") is connected by the ping.
export async function checkRedisConnection(
  client: PingableRedis,
  { subscriber = false } = {},
): Promise<void> {
  const usable =
    client.status === "ready" || (client.status === "wait" && !subscriber)
  if (!usable) throw new Error(`connection is ${client.status}`)
  if (!subscriber) await client.ping()
}
