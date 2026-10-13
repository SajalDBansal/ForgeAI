import type { FastifyReply } from "fastify"
import { RATE_LIMITS, type RateLimit } from "./rate-limit-policy.js"
import { redis } from "./redis.js"

export { RATE_LIMITS }
export type { RateLimit }

// Adds one to the key's count and starts its window on the first request, in one atomic step.
// Returns the new count and the seconds left in the window.
const COUNT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return { count, redis.call("TTL", KEYS[1]) }
`

/** How long to wait for Redis before letting the request through (ioredis would retry for ~10 s). */
const COUNT_TIMEOUT_MS = 500

// Counts one request against `key` and says whether it's within `max` for the current window.
// The count lives in Redis, so every api-server copy shares it. Also better-auth's store (auth.ts).
// If Redis can't be reached the request is allowed: a broken counter mustn't take the API down.
export async function consumeLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Redis timed out")),
        COUNT_TIMEOUT_MS,
      ).unref(),
    )
    const counted = redis.eval(COUNT_SCRIPT, 1, `rate:${key}`, windowSeconds)
    const [count, ttl] = (await Promise.race([counted, timeout])) as [
      number,
      number,
    ]
    return { allowed: count <= max, retryAfter: ttl > 0 ? ttl : windowSeconds }
  } catch (err) {
    console.error(
      "[rate-limit] counter unavailable, allowing the request:",
      err,
    )
    return { allowed: true, retryAfter: 0 }
  }
}

// Returns true when this request is within `limit` for `subject`; otherwise sends a 429 with
// Retry-After and returns false. Used like requireSession: `if (!(await withinLimit(...))) return`.
export async function withinLimit(
  reply: FastifyReply,
  limit: RateLimit,
  subject: string,
): Promise<boolean> {
  const { allowed, retryAfter } = await consumeLimit(
    `${limit.name}:${subject}`,
    limit.max,
    limit.windowSeconds,
  )
  if (allowed) return true

  reply.header("retry-after", String(retryAfter))
  reply
    .status(429)
    .send({ error: `Too many requests. Try again in ${retryAfter} seconds.` })
  return false
}
