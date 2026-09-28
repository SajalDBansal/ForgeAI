import { Redis } from "ioredis"
import {
  checkRedisConnection,
  PRESENCE_STALE_AFTER_MS,
  projectPresenceKey,
} from "@forgeAI/shared"

import { ENV_CONFIG } from "../envConfig.js"

// Its own connection: lib/redis.ts has a subscriber (can't run commands) and a busy publisher.
const redis = new Redis(ENV_CONFIG.REDIS_URL)
redis.on("error", (err) => console.error("[redis:presence]", err))

// Counts how many sockets across all ws-servers have this project open.
// Returns undefined (not 0) when Redis can't answer, so callers never reap on a guess.
export async function countWatchers(
  projectId: string,
): Promise<number | undefined> {
  try {
    return await redis.zcount(
      projectPresenceKey(projectId),
      Date.now() - PRESENCE_STALE_AFTER_MS,
      "+inf",
    )
  } catch (error) {
    console.error(
      `[presence] could not count watchers for ${projectId}:`,
      error,
    )
    return undefined
  }
}

// Closes the presence Redis connection.
// Called on shutdown.
export async function closePresence(): Promise<void> {
  await redis.quit().catch(() => undefined)
}

// Checks the presence connection answers, for /readyz.
// The reaper reads presence; without it nothing is ever reaped.
export async function checkPresenceRedis(): Promise<void> {
  await checkRedisConnection(redis)
}
