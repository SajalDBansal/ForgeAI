import { Redis } from "ioredis"
import { ENV_CONFIG } from "./envConfig.js"

// Single Redis connection for the response cache and the idempotency store.
// ioredis queues commands until it connects, so callers don't need to wait for it.
export const redis = new Redis(ENV_CONFIG.REDIS_URL)

redis.on("error", (err) => console.error("[redis]", err))

// Closes the connection. Called once from server.ts on shutdown.
export async function closeRedis(): Promise<void> {
  await redis.quit().catch(() => undefined)
}
