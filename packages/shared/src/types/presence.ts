// Project presence lives in a Redis sorted set scored by last-seen time, so every
// ws-server and the orchestrator see the same picture and crashed entries age out.

export const PROJECT_PRESENCE_KEY_PREFIX = "presence:"

// Builds the Redis key of a project's presence sorted set.
// Shared by ws-server (writes) and the orchestrator (reads).
export function projectPresenceKey(projectId: string): string {
  return `${PROJECT_PRESENCE_KEY_PREFIX}${projectId}`
}

/** How often each ws-server re-stamps the sockets it holds. */
export const PRESENCE_REFRESH_MS = 15_000

/** How old a stamp may be before its owner is assumed gone (about three missed refreshes). */
export const PRESENCE_STALE_AFTER_MS = 50_000

/** How often a browser reports which files it has open. */
export const FILE_PRESENCE_PING_MS = 10_000

/** How long a tab's last ping keeps it in the room (three missed pings). */
export const FILE_PRESENCE_STALE_AFTER_MS = 30_000

/** How long after an edit somebody still counts as typing. */
export const FILE_EDITING_FOR_MS = 3_000

/** What somebody can be doing in a project, for the "N active" list. */
export const PRESENCE_ACTIVITY_KINDS = [
  "preview",
  "code",
  "terminal",
  "cloud",
  "history",
  "info",
  "chat-agent",
  "chat-team",
  "away",
] as const

export type PresenceActivityKind = (typeof PRESENCE_ACTIVITY_KINDS)[number]

export type PresenceActivity = {
  kind: PresenceActivityKind
  /** The file on screen, for `code`. */
  path?: string
}

/** One person in a project, as everybody else sees them. */
export type PersonPresence = {
  userId: string
  /** Null from a tab that does not report it. */
  activity: PresenceActivity | null
  /** Typing in `activity.path` right now (worked out by the orchestrator). */
  editing: boolean
}
