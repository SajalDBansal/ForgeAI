import { ENV_CONFIG } from "./envConfig.js"
import { redis } from "./redis.js"

export const CONNECTION_CACHE_TTL_SECONDS =
  ENV_CONFIG.CONNECTION_CACHE_TTL_SECONDS
export const METADATA_CACHE_TTL_SECONDS = ENV_CONFIG.METADATA_CACHE_TTL_SECONDS
export const TEMPLATE_CACHE_TTL_SECONDS = ENV_CONFIG.TEMPLATE_CACHE_TTL_SECONDS

// Cache key builders, kept in one place so a reader can see every key this service writes.
export const cacheKeys = {
  connection: (provider: string, userId: string) =>
    `cache:connection:${provider}:${userId}`,
  metadata: (userId: string) => `cache:metadata:${userId}`,
  templateList: (userId: string) => `cache:templates:list:${userId}`,
  templateDetail: (userId: string, templateId: string) =>
    `cache:templates:detail:${userId}:${templateId}`,
}

// Returns the cached JSON value for `key`, or computes it with `compute` and caches it for `ttlSeconds`.
// A Redis error is treated as a miss, so an outage falls back to always computing instead of failing requests.
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = await redis.get(key).catch(() => null)
  if (hit) return JSON.parse(hit) as T

  const value = await compute()
  await redis
    .set(key, JSON.stringify(value), "EX", ttlSeconds)
    .catch(() => undefined)
  return value
}

// Deletes one or more cache keys, ignoring a Redis error.
// Called right after a write that would otherwise leave a stale cached read.
export async function invalidateCache(...keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await redis.del(...keys).catch(() => undefined)
}
