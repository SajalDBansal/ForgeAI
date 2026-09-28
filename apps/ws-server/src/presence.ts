import { Redis } from "ioredis"
import {
  checkRedisConnection,
  PRESENCE_REFRESH_MS,
  PRESENCE_STALE_AFTER_MS,
  projectPresenceKey,
} from "@forgeAI/shared"

import { ENV_CONFIG } from "./envConfig.js"

// Its own connection: the subscriber can't run commands and the publisher is on the keystroke path.
const redis = new Redis(ENV_CONFIG.REDIS_URL)
redis.on("error", (err) => console.error("[redis:presence]", err))

/** socketId -> projectId for every socket this instance keeps marked present. */
const local = new Map<string, string>()

// Marks a socket as present in a project.
// Called when a socket connects to a project room.
export function joinPresence(socketId: string, projectId: string): void {
  local.set(socketId, projectId)
  void stamp([[socketId, projectId]])
}

// Removes a socket from presence immediately instead of waiting for it to go stale.
// Called on disconnect.
export function leavePresence(socketId: string): void {
  const projectId = local.get(socketId)
  if (!projectId) return
  local.delete(socketId)

  redis.zrem(projectPresenceKey(projectId), socketId).catch((err) => {
    // Not worth failing a disconnect over: the entry ages out by itself.
    console.error(
      `[presence] could not remove ${socketId} from ${projectId}:`,
      err,
    )
  })
}

// Refreshes the last-seen score for each socket and prunes stale entries.
// The key's TTL only cleans up abandoned keys; scores decide presence.
async function stamp(
  entries: [socketId: string, projectId: string][],
): Promise<void> {
  if (entries.length === 0) return

  const now = Date.now()
  const pipeline = redis.pipeline()

  for (const [socketId, projectId] of entries) {
    const key = projectPresenceKey(projectId)
    pipeline.zadd(key, now, socketId)
    pipeline.zremrangebyscore(key, "-inf", now - PRESENCE_STALE_AFTER_MS)
    pipeline.pexpire(key, PRESENCE_STALE_AFTER_MS * 4)
  }

  try {
    await pipeline.exec()
  } catch (err) {
    console.error("[presence] could not refresh:", err)
  }
}

// Heartbeat for every socket this instance holds. Unreffed so it never keeps the process alive.
setInterval(() => {
  void stamp([...local].map(([socketId, projectId]) => [socketId, projectId]))
}, PRESENCE_REFRESH_MS).unref()

// Removes all of this instance's presence entries and closes the Redis connection.
// Called on clean shutdown so projects don't look occupied for the stale window.
export async function closePresence(): Promise<void> {
  const entries = [...local]
  local.clear()

  if (entries.length) {
    const pipeline = redis.pipeline()
    for (const [socketId, projectId] of entries)
      pipeline.zrem(projectPresenceKey(projectId), socketId)
    await pipeline.exec().catch(() => undefined)
  }

  await redis.quit().catch(() => undefined)
}

// Checks the presence connection answers, for /readyz.
export async function checkPresenceRedis(): Promise<void> {
  await checkRedisConnection(redis)
}
