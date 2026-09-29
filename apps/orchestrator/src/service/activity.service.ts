import { ENV_CONFIG } from "../envConfig.js"
import {
  getPod,
  getPodExtendedAt,
  getPodStartedAt,
  markPodUsed,
  setPodExtendedAt,
} from "../state.js"
import { provider } from "../lib/provider.js"

/** How long a sandbox lives before E2B reclaims it (passed on create and every extend). */
export const SANDBOX_TIMEOUT_MS =
  ENV_CONFIG.SANDBOX_IDLE_TIMEOUT_MINUTES * 60_000

/** Minimum gap between keep-alive calls to E2B for a busy project. */
const KEEP_ALIVE_EVERY_MS = 5 * 60_000

/** The provider's cap on a sandbox's whole life, from creation; null when it has none (F6). */
const MAX_LIFETIME_MS = provider.capabilities.maxLifetimeMs

// Computes how far the expiry can be pushed without passing the provider's lifetime cap.
// Returns the full timeout when there's no cap or the sandbox's start time is unknown.
function allowedTimeoutMs(projectId: string): number {
  const startedAt = getPodStartedAt(projectId)
  const lifeLeft =
    startedAt === undefined || MAX_LIFETIME_MS === null
      ? SANDBOX_TIMEOUT_MS
      : startedAt + MAX_LIFETIME_MS - Date.now()
  return Math.min(SANDBOX_TIMEOUT_MS, lifeLeft)
}

// Extends the sandbox's E2B expiry and records when we did.
// Records before awaiting so concurrent callers don't all fire; rolls back on failure.
async function pushExpiry(projectId: string, sandboxId: string): Promise<void> {
  const previous = getPodExtendedAt(projectId)
  setPodExtendedAt(projectId, Date.now())

  const timeoutMs = allowedTimeoutMs(projectId)
  if (timeoutMs <= 0) return

  try {
    await provider.keepPodAlive(sandboxId, timeoutMs)
  } catch (error) {
    setPodExtendedAt(projectId, previous)
    console.error(
      `[activity] could not extend sandbox for ${projectId}:`,
      error,
    )
  }
}

// Marks the pod used and extends its expiry right away, waiting for E2B.
// Used for strong signals like opening a project.
export async function extendPodNow(
  projectId: string,
  sandboxId: string,
): Promise<void> {
  markPodUsed(projectId)
  await pushExpiry(projectId, sandboxId)
}

// Keeps the sandbox alive without counting as a person's activity.
// Used for background work (e.g. a running dev server) so the idle timer still works.
export function holdPod(projectId: string): void {
  const pod = getPod(projectId)
  if (!pod) return
  if (Date.now() - getPodExtendedAt(projectId) < KEEP_ALIVE_EVERY_MS) return

  void pushExpiry(projectId, pod.sandboxId)
}

// Records user activity and extends the expiry at most once per keep-alive interval.
// Cheap and fire-and-forget, so it's safe on the keystroke path.
export function touchPod(projectId: string): void {
  const pod = getPod(projectId)
  if (!pod) return

  markPodUsed(projectId)
  if (Date.now() - getPodExtendedAt(projectId) < KEEP_ALIVE_EVERY_MS) return

  void pushExpiry(projectId, pod.sandboxId)
}
