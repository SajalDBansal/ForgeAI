import { randomUUID } from "node:crypto"

import { redis } from "./project-events.js"

/** Atomically deletes the lock only if we still own it. */
const RELEASE_IF_OURS = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`

export type LockedResult<T> =
  { ok: true; value: T } | { ok: false; reason: "busy" }

// Runs `work` under a Redis lock on one project, or returns `busy` if it's already held.
// Redis because api-server runs many copies; `ttlMs` must outlast the work.
export async function withProjectLock<T>(
  name: string,
  projectId: string,
  ttlMs: number,
  work: () => Promise<T>,
): Promise<LockedResult<T>> {
  const key = `lock:${name}:${projectId}`
  const token = randomUUID()

  const acquired = await redis.set(key, token, "PX", ttlMs, "NX")
  if (acquired !== "OK") return { ok: false, reason: "busy" }

  try {
    return { ok: true, value: await work() }
  } finally {
    await redis.eval(RELEASE_IF_OURS, 1, key, token).catch((error: unknown) => {
      // Not worth failing the action over: the lock expires by itself.
      console.error(`[locks] could not release ${key}:`, error)
    })
  }
}
