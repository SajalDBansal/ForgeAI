import { Redis } from "ioredis"
import {
  bumpProjectAccessVersion,
  currentProjectAccessVersion,
  ProjectEvent,
} from "@forgeAI/shared"
import { ENV_CONFIG } from "./envConfig.js"

const CHANNEL_PREFIX = "project-events:"

/** Shared by event publishing and the per-project locks in lib/locks.ts. */
export const redis = new Redis(ENV_CONFIG.REDIS_URL, { lazyConnect: true })
redis.on("error", (err) => console.error("[project-events] redis error:", err))

// Publishes a durable project event for ws-server to forward to the project's tabs.
// Used after every write that other collaborators should see live.
export function publishProjectEvent(event: ProjectEvent): void {
  redis
    .publish(`${CHANNEL_PREFIX}${event.projectId}`, JSON.stringify(event))
    .catch((err) => {
      console.error("[project-events] publish failed:", err)
    })
}

// Tells ws-servers that access changed for one user (or everyone when null) on these projects.
// Call only after the change is saved: the reconnect immediately asks for a fresh ticket.
export async function accessVersionForTicket(
  projectId: string,
  userId: string,
): Promise<string> {
  return currentProjectAccessVersion(redis, projectId, userId)
}

export async function publishAccessChanged(
  projectIds: string[],
  userId: string | null,
): Promise<void> {
  for (const projectId of projectIds) {
    await bumpProjectAccessVersion(redis, projectId, userId)
    publishProjectEvent({ type: "access.changed", projectId, userId })
  }
}

// Closes the events connection. Called once from server.ts on shutdown.
export async function closeProjectEvents(): Promise<void> {
  await redis.quit().catch(() => undefined)
}
