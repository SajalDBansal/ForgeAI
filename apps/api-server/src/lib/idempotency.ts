import type { FastifyReply } from "fastify"
import { ENV_CONFIG } from "./envConfig.js"
import { sendResult, type HttpResult } from "./http.js"
import { redis } from "./redis.js"

const RESULT_TTL_SECONDS = ENV_CONFIG.IDEMPOTENCY_RESULT_TTL_SECONDS
const RUNNING_TTL_MS = ENV_CONFIG.IDEMPOTENCY_RUNNING_TTL_MS
const RUNNING = "running"
/** `code` lets the web app recognise this 409 and stay quiet instead of showing an error. */
const ALREADY_RUNNING: HttpResult = {
  status: 409,
  body: {
    error: "This request is already being processed",
    code: "REQUEST_IN_PROGRESS",
  },
}

// Builds the Redis key. Including the user means two people can never collide on the same key.
function redisKeyFor(userId: string, idempotencyKey: string): string {
  return `idempotency:${userId}:${idempotencyKey}`
}

// Looks up what Redis remembers for this key: nothing, "running", or the saved result.
// A Redis error counts as "nothing", so an outage lets the request run instead of blocking it.
async function readEntry(
  redisKey: string,
): Promise<HttpResult | typeof RUNNING | null> {
  const raw = await redis.get(redisKey).catch(() => null)
  if (!raw) return null
  return raw === RUNNING ? RUNNING : (JSON.parse(raw) as HttpResult)
}

// Marks the key as running, but only if nobody else already has (SET ... NX).
// Returns false when another request got there first. A Redis error counts as "claimed".
async function claim(redisKey: string): Promise<boolean> {
  const reply = await redis
    .set(redisKey, RUNNING, "PX", RUNNING_TTL_MS, "NX")
    .catch(() => "OK" as const)
  return reply === "OK"
}

// Forgets the key so the same request can be tried again.
async function release(redisKey: string): Promise<void> {
  await redis.del(redisKey).catch(() => undefined)
}

// Remembers a successful (2xx) result for later replays; forgets the key after a failure,
// so a failed attempt can be retried under the same key.
async function finish(redisKey: string, result: HttpResult): Promise<void> {
  const succeeded = result.status >= 200 && result.status < 300
  if (!succeeded) return release(redisKey)
  await redis
    .set(redisKey, JSON.stringify(result), "EX", RESULT_TTL_SECONDS)
    .catch(() => undefined)
}

// Runs `perform` at most once per (user, Idempotency-Key): a repeat with the same key gets the
// first result back instead of running the mutation again. `perform` returns the answer as data.
// Wrap creates, commits and invites that a double click or a timed-out retry could duplicate.
export async function withIdempotency(
  reply: FastifyReply,
  userId: string,
  idempotencyKeyHeader: string | string[] | undefined,
  perform: () => Promise<HttpResult>,
): Promise<FastifyReply> {
  const idempotencyKey = Array.isArray(idempotencyKeyHeader)
    ? idempotencyKeyHeader[0]
    : idempotencyKeyHeader

  // 1. No key sent: behave like a normal request.
  if (!idempotencyKey) return sendResult(reply, await perform())

  const redisKey = redisKeyFor(userId, idempotencyKey)

  // 2. Seen before: replay the saved result, or say it's still running.
  const saved = await readEntry(redisKey)
  if (saved === RUNNING) return sendResult(reply, ALREADY_RUNNING)
  if (saved) return sendResult(reply, saved)

  // 3. New key: claim it so a parallel duplicate is turned away.
  if (!(await claim(redisKey))) return sendResult(reply, ALREADY_RUNNING)

  // 4. Do the real work. If it crashes, free the key so a retry can run.
  let result: HttpResult
  try {
    result = await perform()
  } catch (error) {
    await release(redisKey)
    throw error
  }

  // 5. Remember the result (if it succeeded) and answer.
  await finish(redisKey, result)
  return sendResult(reply, result)
}
