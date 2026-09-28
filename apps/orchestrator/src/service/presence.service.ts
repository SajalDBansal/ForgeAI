import {
  FILE_EDITING_FOR_MS,
  FILE_PRESENCE_STALE_AFTER_MS,
  type FilePresence,
  type PersonPresence,
  type PresenceActivity,
  type TerminalCommand,
} from "@forgeAI/shared"

import { publishSandboxEvent } from "../lib/redis.js"

// Who has which file open and who is typing. Kept here (not in ws-server) because
// this is the one process that sees the whole room. Never touches E2B.
//
// Tracked per browser tab, published per person: one person with two tabs has two entries,
// so one tab's ping can't erase the files the other has open.

/** Who sent a command: the person, and the tab (socket) when ws-server stamped it. */
export type PresenceSource = Pick<TerminalCommand, "userId" | "connectionId">

interface TabPresence {
  userId: string
  /** Files this tab has open; replaced wholesale by each of its pings. */
  paths: Set<string>
  /** Last time we heard anything from this tab. */
  seenAt: number
  /** path -> when the typing indicator for it expires. */
  editingUntil: Map<string, number>
  /** What the tab is doing, from its last ping. */
  activity: PresenceActivity | null
}

interface AgentPresence {
  path: string
  until: number
}

/** projectId -> tab key -> what that tab has open. */
const rooms = new Map<string, Map<string, TabPresence>>()
const agents = new Map<string, AgentPresence>()

/** The last thing published per project, so unchanged rooms publish nothing. */
const published = new Map<string, string>()

/** Sweep interval; the resolution of "stopped typing". */
const SWEEP_MS = 1_000

let sweeper: ReturnType<typeof setInterval> | undefined

// Returns a tab's presence entry in a project, creating the room and entry if needed.
// Without a connection id (an older ws-server), the person stands in for the tab.
function tabIn(projectId: string, source: PresenceSource): TabPresence {
  let room = rooms.get(projectId)
  if (!room) {
    room = new Map()
    rooms.set(projectId, room)
  }

  const key = source.connectionId ?? source.userId
  let tab = room.get(key)
  if (!tab) {
    tab = {
      userId: source.userId,
      paths: new Set(),
      seenAt: Date.now(),
      editingUntil: new Map(),
      activity: null,
    }
    room.set(key, tab)
  }
  return tab
}

// Checks whether a tab is typing in a path right now.
// Typing indicators expire FILE_EDITING_FOR_MS after the last edit.
function isEditing(tab: TabPresence, path: string, now: number): boolean {
  return (tab.editingUntil.get(path) ?? 0) > now
}

// Builds the per-file list of who is viewing and who is typing, one entry per person, sorted.
// Sorting matters: publish compares strings to skip unchanged rooms.
function pictureOf(projectId: string): FilePresence[] {
  const room = rooms.get(projectId)
  const agent = agents.get(projectId)
  if (!room && !agent) return []

  const now = Date.now()
  /** path -> userId -> typing in any of their tabs */
  const byPath = new Map<string, Map<string, boolean>>()

  for (const tab of room?.values() ?? []) {
    for (const path of tab.paths) {
      const viewers = byPath.get(path) ?? new Map<string, boolean>()
      viewers.set(
        tab.userId,
        (viewers.get(tab.userId) ?? false) || isEditing(tab, path, now),
      )
      byPath.set(path, viewers)
    }
  }
  if (agent && agent.until > now) {
    const viewers = byPath.get(agent.path) ?? new Map<string, boolean>()
    viewers.set("forgeai-agent", true)
    byPath.set(agent.path, viewers)
  }

  return [...byPath.entries()]
    .map(([path, viewers]) => ({
      path,
      viewers: [...viewers.entries()]
        .map(([userId, editing]) => ({ userId, editing }))
        .sort((a, b) => a.userId.localeCompare(b.userId)),
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

// Picks the tab that best says what a person is doing: the most recently heard one that isn't away.
// A person counts as away only when every one of their tabs is.
function liveliestTab(tabs: TabPresence[]): TabPresence {
  const byRecency = [...tabs].sort((a, b) => b.seenAt - a.seenAt)
  return byRecency.find((tab) => tab.activity?.kind !== "away") ?? byRecency[0]!
}

// Lists everyone in the room with their current activity, sorted by user id.
// Feeds the "N active" list in the builder.
function peopleOf(projectId: string): PersonPresence[] {
  const room = rooms.get(projectId)
  const agent = agents.get(projectId)
  if (!room && !agent) return []

  const tabsByUser = new Map<string, TabPresence[]>()
  for (const tab of room?.values() ?? []) {
    const tabs = tabsByUser.get(tab.userId) ?? []
    tabs.push(tab)
    tabsByUser.set(tab.userId, tabs)
  }

  const now = Date.now()
  const people = [...tabsByUser.entries()]
    .map(([userId, tabs]) => {
      const activity = liveliestTab(tabs).activity
      const path = activity?.path
      return {
        userId,
        activity,
        editing: !!path && tabs.some((tab) => isEditing(tab, path, now)),
      }
    })
    .sort((a, b) => a.userId.localeCompare(b.userId))
  if (agent && agent.until > now) {
    people.push({
      userId: "forgeai-agent",
      activity: { kind: "code", path: agent.path },
      editing: true,
    })
  }
  return people
}

// Publishes the room's presence, but only if it changed since last time.
// Keeps the per-second sweep free when nobody moves.
function publish(projectId: string): void {
  const files = pictureOf(projectId)
  const people = peopleOf(projectId)
  const encoded = JSON.stringify([files, people])
  if (published.get(projectId) === encoded) return

  published.set(projectId, encoded)
  publishSandboxEvent({ type: "file.presence", projectId, files, people })
}

// Drops tabs we haven't heard from and expires their stale typing indicators.
// Browsers never say goodbye reliably, so expiry is the design, not a safety net.
function pruneRoom(room: Map<string, TabPresence>, now: number): void {
  for (const [key, tab] of room) {
    if (now - tab.seenAt > FILE_PRESENCE_STALE_AFTER_MS) {
      room.delete(key)
      continue
    }
    for (const [path, until] of tab.editingUntil) {
      if (until <= now) tab.editingUntil.delete(path)
    }
  }
}

// Prunes every room and publishes changes; stops the timer once all rooms are empty.
// Runs every SWEEP_MS while anyone is present.
function sweep(): void {
  const now = Date.now()

  for (const [projectId, room] of rooms) {
    pruneRoom(room, now)

    if (room.size === 0) {
      rooms.delete(projectId)
      // Publish once more so the last person leaving empties everyone's list.
      publish(projectId)
      published.delete(projectId)
      continue
    }

    publish(projectId)
  }

  for (const [projectId, agent] of agents) {
    if (agent.until > now) continue
    agents.delete(projectId)
    publish(projectId)
    if (!rooms.has(projectId)) published.delete(projectId)
  }

  if (rooms.size === 0 && agents.size === 0 && sweeper) {
    clearInterval(sweeper)
    sweeper = undefined
  }
}

// Starts the sweep timer if it isn't running.
// The timer only runs while someone is present, and never holds the process open.
function ensureSweeping(): void {
  if (sweeper) return
  sweeper = setInterval(sweep, SWEEP_MS)
  sweeper.unref?.()
}

// Records a tab's heartbeat: which files it has open and what it's doing.
// Also drops typing indicators for files no longer open.
export function handlePresencePing(
  command: Extract<TerminalCommand, { type: "presence.ping" }>,
): void {
  const tab = tabIn(command.projectId, command)
  tab.paths = new Set(command.paths)
  tab.seenAt = Date.now()
  tab.activity = command.activity ?? null

  for (const path of tab.editingUntil.keys()) {
    if (!tab.paths.has(path)) tab.editingUntil.delete(path)
  }

  ensureSweeping()
  publish(command.projectId)
}

// Records that a tab opened a file, immediately rather than on the next ping.
// Called by the document service on doc.open.
export function notePresenceOpen(
  projectId: string,
  source: PresenceSource,
  path: string,
): void {
  const tab = tabIn(projectId, source)
  tab.paths.add(path)
  tab.seenAt = Date.now()
  ensureSweeping()
  publish(projectId)
}

// Records that a tab closed a file.
// Called by the document service on doc.close.
export function notePresenceClose(
  projectId: string,
  source: PresenceSource,
  path: string,
): void {
  const tab = rooms.get(projectId)?.get(source.connectionId ?? source.userId)
  if (!tab) return

  tab.paths.delete(path)
  tab.editingUntil.delete(path)
  tab.seenAt = Date.now()
  publish(projectId)
}

// Marks a tab as typing in a file; the indicator expires on its own.
// Driven by document updates, so typing needs no message of its own.
export function notePresenceEditing(
  projectId: string,
  source: PresenceSource,
  path: string,
): void {
  const tab = tabIn(projectId, source)
  tab.paths.add(path)
  tab.seenAt = Date.now()
  tab.editingUntil.set(path, Date.now() + FILE_EDITING_FOR_MS)
  ensureSweeping()
  publish(projectId)
}

// Shows the agent in the same presence picture as people while it changes a file.
export function noteAgentEditing(projectId: string, path: string): void {
  agents.set(projectId, { path, until: Date.now() + FILE_EDITING_FOR_MS })
  ensureSweeping()
  publish(projectId)
}

// Checks whether any live tab has a file open; a tab that stopped pinging doesn't count.
// The document service only frees a document nobody is looking at.
export function isPathOpen(projectId: string, path: string): boolean {
  const room = rooms.get(projectId)
  if (!room) return false
  const now = Date.now()
  for (const tab of room.values()) {
    if (tab.paths.has(path) && now - tab.seenAt <= FILE_PRESENCE_STALE_AFTER_MS)
      return true
  }
  return false
}

// Forgets a project's presence entirely and publishes the empty room.
// Called when the project's sandbox goes away.
export function clearProjectPresence(projectId: string): void {
  const changed = rooms.delete(projectId) || agents.delete(projectId)
  if (!changed) return
  publish(projectId)
  published.delete(projectId)
}

// Returns how many people this process thinks are in a project.
// Test helper.
export function presenceCount(projectId: string): number {
  return new Set(
    [...(rooms.get(projectId)?.values() ?? [])].map((tab) => tab.userId),
  ).size
}
