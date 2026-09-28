import { Redis } from "ioredis"
import {
  AGENT_EVENTS_CHANNEL_PREFIX,
  agentEventsChannel,
  agentLiveStateKey,
  parseAgentSnapshot,
  checkRedisConnection,
  currentProjectAccessVersion,
  SANDBOX_EVENTS_CHANNEL_PREFIX,
  sandboxCommandsChannel,
  sandboxEventsChannel,
  type AgentSnapshot,
  type TerminalCommand,
} from "@forgeAI/shared"
import { ENV_CONFIG } from "./envConfig.js"

const CHANNEL_PREFIX = "project-events:"

// Separate connections: a subscriber-mode client can't publish.
const subscriber = new Redis(ENV_CONFIG.REDIS_URL)
const publisher = new Redis(ENV_CONFIG.REDIS_URL)
subscriber.on("error", (err) => console.error("[redis:subscriber]", err))
publisher.on("error", (err) => console.error("[redis:publisher]", err))

let onProjectEvent: ((projectId: string, event: unknown) => void) | null = null
let onSandboxEvent: ((projectId: string, event: unknown) => void) | null = null
let onAgentEvent: ((projectId: string, event: unknown) => void) | null = null

// Registers the callback for durable project events.
// Set once by server.ts to forward events to the project's room.
export function setProjectEventHandler(
  handler: (projectId: string, event: unknown) => void,
): void {
  onProjectEvent = handler
}

// Registers the callback for live sandbox events.
// Set once by server.ts to forward terminal and dev-server output.
export function setSandboxEventHandler(
  handler: (projectId: string, event: unknown) => void,
): void {
  onSandboxEvent = handler
}

// Registers the callback for live agent events.
// Set once by server.ts to forward the agent's streaming and status.
export function setAgentEventHandler(
  handler: (projectId: string, event: unknown) => void,
): void {
  onAgentEvent = handler
}

// Routes each Redis message to the project, sandbox or agent handler by channel prefix.
subscriber.on("message", (channel, message) => {
  const prefix =
    [SANDBOX_EVENTS_CHANNEL_PREFIX, AGENT_EVENTS_CHANNEL_PREFIX].find((p) =>
      channel.startsWith(p),
    ) ?? CHANNEL_PREFIX
  const projectId = channel.slice(prefix.length)
  try {
    const payload = JSON.parse(message)
    if (prefix === SANDBOX_EVENTS_CHANNEL_PREFIX)
      onSandboxEvent?.(projectId, payload)
    else if (prefix === AGENT_EVENTS_CHANNEL_PREFIX)
      onAgentEvent?.(projectId, payload)
    else onProjectEvent?.(projectId, payload)
  } catch (err) {
    console.error(
      `[redis:subscriber] failed to handle message for project ${projectId}:`,
      err,
    )
  }
})

// Subscribes to all three of a project's channels (project, sandbox and agent events).
// Called when the first socket for that project joins this instance.
export async function subscribeToProject(projectId: string): Promise<void> {
  await subscriber
    .subscribe(
      `${CHANNEL_PREFIX}${projectId}`,
      sandboxEventsChannel(projectId),
      agentEventsChannel(projectId),
    )
    .catch((err) => {
      console.error(
        `[redis:subscriber] failed to subscribe to project ${projectId}:`,
        err,
      )
    })
}

// Unsubscribes from all three of a project's channels.
// Called when the last socket for that project leaves this instance.
export function unsubscribeFromProject(projectId: string): void {
  subscriber
    .unsubscribe(
      `${CHANNEL_PREFIX}${projectId}`,
      sandboxEventsChannel(projectId),
      agentEventsChannel(projectId),
    )
    .catch((err) => {
      console.error(
        `[redis:subscriber] failed to unsubscribe from project ${projectId}:`,
        err,
      )
    })
}

// Publishes a browser's terminal command for the orchestrator to execute.
// The orchestrator is the only subscriber on the commands channel.
export function publishTerminalCommand(command: TerminalCommand): void {
  publisher
    .publish(sandboxCommandsChannel(command.projectId), JSON.stringify(command))
    .catch((err) => {
      console.error(
        `[sandbox-commands] publish failed for ${command.projectId}:`,
        err,
      )
    })
}

// Reads the current agent live state for one project. Used when a tab joins mid-run; normal
// streaming still comes through pub/sub.
export async function getAgentSnapshot(
  projectId: string,
): Promise<AgentSnapshot> {
  const raw = await publisher.get(agentLiveStateKey(projectId))
  return parseAgentSnapshot(raw)
}

export async function getProjectAccessVersion(
  projectId: string,
  userId: string,
): Promise<string> {
  return currentProjectAccessVersion(publisher, projectId, userId)
}

// Closes both Redis connections.
// Called on shutdown.
export async function closeRedis(): Promise<void> {
  await Promise.allSettled([subscriber.quit(), publisher.quit()])
}

// Checks both connections for /readyz: the subscriber is connected, and the publisher answers.
// Without the subscriber, no event reaches any tab on this instance.
export async function checkRedis(): Promise<void> {
  await Promise.all([
    checkRedisConnection(subscriber, { subscriber: true }),
    checkRedisConnection(publisher),
  ])
}
