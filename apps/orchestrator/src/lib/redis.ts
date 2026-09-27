import { Redis } from "ioredis"
import {
  createAgentEventPublisher,
  checkRedisConnection,
  SANDBOX_COMMANDS_CHANNEL_PREFIX,
  sandboxEventsChannel,
  type AgentEvent,
  type SandboxEvent,
  type TerminalCommand,
} from "@forgeAI/shared"
import { ENV_CONFIG } from "../envConfig.js"

// A subscriber-mode connection can't publish, so there are two clients.
const subscriber = new Redis(ENV_CONFIG.REDIS_URL, { autoResubscribe: false })
const publisher = new Redis(ENV_CONFIG.REDIS_URL)
const liveEvents = createAgentEventPublisher(publisher)
const commandsPattern = `${SANDBOX_COMMANDS_CHANNEL_PREFIX}*`
let acceptingCommands = false
let commandsSubscribed = false

// Subscribe only after the INFO handshake; repeat and acknowledge on reconnect.
function subscribeCommands(): void {
  if (!acceptingCommands) return
  subscriber.psubscribe(commandsPattern).then(
    () => {
      commandsSubscribed = acceptingCommands
    },
    (err) => {
      commandsSubscribed = false
      console.error(
        `[sandbox-commands] could not subscribe to ${commandsPattern}:`,
        err,
      )
    },
  )
}
subscriber.on("ready", subscribeCommands)
subscriber.on("close", () => {
  commandsSubscribed = false
})

subscriber.on("error", (err) => console.error("[redis:subscriber]", err))
publisher.on("error", (err) => console.error("[redis:publisher]", err))

/** For plain commands (the spend counters); a subscriber-mode connection can't run them. */
export const redisCommands = publisher

// Publishes a sandbox event for every ws-server to fan out to the project's tabs.
// Used by all services that report terminal, document and dev-server activity.
export function publishSandboxEvent(event: SandboxEvent): void {
  publisher
    .publish(sandboxEventsChannel(event.projectId), JSON.stringify(event))
    .catch((err) => {
      console.error(
        `[sandbox-events] publish failed for ${event.projectId}:`,
        err,
      )
    })
}

// Publishes agent tool events from orchestrator-owned work, such as command output (I7).
export function publishAgentEvent(projectId: string, event: AgentEvent): void {
  liveEvents.publish(projectId, event).catch((err) => {
    console.error(`[agent-events] publish failed for ${projectId}:`, err)
  })
}

// Pattern-subscribes to browser commands for every project at once.
// The orchestrator is the only subscriber, so one subscription covers everything.
export function subscribeToTerminalCommands(
  handle: (command: TerminalCommand) => void,
): void {
  acceptingCommands = true
  subscriber.on("pmessage", (_pattern, channel, message) => {
    const projectId = channel.slice(SANDBOX_COMMANDS_CHANNEL_PREFIX.length)
    try {
      const command = JSON.parse(message) as TerminalCommand
      // The channel (derived from the ticket) decides the project, not the payload.
      handle({ ...command, projectId })
    } catch (err) {
      console.error(`[sandbox-commands] bad message for ${projectId}:`, err)
    }
  })
  if (subscriber.status === "ready") subscribeCommands()
}

// Stops accepting browser commands.
// First step of shutdown so nothing is half-applied while saving.
export async function stopTerminalCommands(): Promise<void> {
  acceptingCommands = false
  commandsSubscribed = false
  await subscriber.punsubscribe(commandsPattern).catch(() => undefined)
}

// Closes both Redis connections.
// Called on shutdown.
export async function closeRedis(): Promise<void> {
  await liveEvents.drain()
  await Promise.allSettled([subscriber.quit(), publisher.quit()])
}

// Checks both connections for /readyz: the subscriber is connected, and the publisher answers.
// Without the subscriber, browser commands silently stop arriving.
export async function checkRedis(): Promise<void> {
  await Promise.all([
    checkRedisConnection(subscriber, { subscriber: true }),
    checkRedisConnection(publisher),
  ])
  if (!commandsSubscribed)
    throw new Error("Redis command subscription is not ready")
}
