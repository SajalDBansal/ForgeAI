import {
  createAgentEventPublisher,
  agentProjectLockKey,
  agentRunInputChannel,
  checkRedisConnection,
  type AgentEvent,
  type AgentRunInput,
  type ChatMessage,
} from "@forgeAI/shared"
import { Redis } from "ioredis"

import { ENV_CONFIG } from "./envConfig.js"

/** Saved project events (chat messages); the same channel api-server publishes on and ws-server forwards. */
const PROJECT_EVENTS_PREFIX = "project-events:"

// Publishing and the per-project locks. BullMQ gets its own connection (see index.ts).
export const redis = new Redis(ENV_CONFIG.REDIS_URL)
redis.on("error", (err) => console.error("[agent-worker:redis]", err))
const liveEvents = createAgentEventPublisher(redis)

const inputRedis = new Redis(ENV_CONFIG.REDIS_URL)
inputRedis.on("error", (err) =>
  console.error("[agent-worker:input-redis]", err),
)
const inputHandlers = new Map<string, (input: AgentRunInput) => void>()

inputRedis.on("message", (channel, raw) => {
  const handler = inputHandlers.get(channel)
  if (!handler) return
  try {
    const input = JSON.parse(raw) as AgentRunInput
    if (input?.type === "user.message") handler(input)
  } catch (error) {
    console.error("[agent-worker] bad run input:", error)
  }
})

// Publishes a live agent event (I3) for every open tab of the project, after updating the
// compact Redis snapshot that lets late tabs catch up.
export function publishAgentEvent(projectId: string, event: AgentEvent): void {
  liveEvents
    .publish(projectId, event)
    .catch((err) => console.error("[agent-worker] event publish failed:", err))
}

// Publishes a newly saved chat message, so every open tab shows it.
export function publishChatMessage(message: ChatMessage): void {
  redis
    .publish(
      `${PROJECT_EVENTS_PREFIX}${message.projectId}`,
      JSON.stringify({
        type: "message.created",
        projectId: message.projectId,
        message,
      }),
    )
    .catch((err) =>
      console.error("[agent-worker] message publish failed:", err),
    )
}

// Listens for user messages attached to a RUNNING run. The returned function removes only this
// run's handler; the shared Redis subscriber stays open for other runs in this worker.
export async function watchRunInputs(
  runId: string,
  handler: (input: AgentRunInput) => void,
): Promise<() => Promise<void>> {
  const channel = agentRunInputChannel(runId)
  inputHandlers.set(channel, handler)
  await inputRedis.subscribe(channel)
  return async () => {
    inputHandlers.delete(channel)
    await inputRedis.unsubscribe(channel).catch(() => undefined)
  }
}

// ---------- ONE RUN AT A TIME PER PROJECT ----------
// Each worker attempt has its own token, including two deliveries of the same run.

const ACQUIRE = `
if redis.call("exists", KEYS[1]) == 0 then
  redis.call("set", KEYS[1], ARGV[1], "PX", ARGV[2])
  return 1
end
return 0`

const RENEW = `
if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) end
return 0`

const RELEASE = `
if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end
return 0`

// Takes the project's lock for this run; false when another run holds it.
export async function acquireProjectLock(
  projectId: string,
  runId: string,
): Promise<boolean> {
  return (
    (await redis.eval(
      ACQUIRE,
      1,
      agentProjectLockKey(projectId),
      runId,
      ENV_CONFIG.RUN_LOCK_TTL_MS,
    )) === 1
  )
}

// Keeps the lock alive while the run works.
export async function renewProjectLock(
  projectId: string,
  runId: string,
): Promise<boolean> {
  return (
    (await redis.eval(
      RENEW,
      1,
      agentProjectLockKey(projectId),
      runId,
      ENV_CONFIG.RUN_LOCK_TTL_MS,
    )) === 1
  )
}

// Gives the lock up, only if this run still holds it.
export async function releaseProjectLock(
  projectId: string,
  runId: string,
): Promise<void> {
  await redis.eval(RELEASE, 1, agentProjectLockKey(projectId), runId)
}

// For /readyz: Redis answers.
export async function checkRedis(): Promise<void> {
  await checkRedisConnection(redis)
}

export async function closeRedis(): Promise<void> {
  await liveEvents.drain()
  await Promise.all([
    redis.quit().catch(() => undefined),
    inputRedis.quit().catch(() => undefined),
  ])
}
