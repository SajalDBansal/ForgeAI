import type { PodFileChange, PodWatcher } from "@forgeAI/sandbox-provider"
import {
  isIgnoredPath,
  PROJECT_ROOT,
  type SandboxFileChange,
} from "@forgeAI/shared"

import { publishSandboxEvent } from "../lib/redis.js"
import { noteExternalChange, recheckOpenDocuments } from "./document.service.js"
import { getPod } from "../state.js"
import { provider } from "../lib/provider.js"

/** How long changes are gathered before one `fs.changed` message is sent. */
const BATCH_MS = 150

/** Most paths one message carries; past it the message says `truncated` and tabs re-list instead. */
const MAX_BATCH = 200

/** Wait before re-arming a watch that stopped on its own: 1 s, doubling, at most 30 s. */
const RESTART_MIN_MS = 1_000
const RESTART_MAX_MS = 30_000

/** A watch that ran this long was healthy; if it then stops, the backoff starts over at 1 s. */
const HEALTHY_AFTER_MS = 60_000

interface ProjectWatcher {
  /** One watch per directory, keyed by project-relative path (root is `""`). */
  watchers: Map<string, PodWatcher | undefined>
  pending: Map<string, SandboxFileChange>
  /** Ignored top-level areas that changed (e.g. `node_modules`), by name only. */
  pendingIgnored: Set<string>
  timer?: ReturnType<typeof setTimeout>
  stopping?: boolean
  /** When each watch came up, to tell a healthy watch from one that keeps failing. */
  startedAt: Map<string, number>
  /** Pending re-arms for watches that stopped on their own, with how many times in a row. */
  restarts: Map<
    string,
    { attempts: number; timer?: ReturnType<typeof setTimeout> }
  >
  /** The current watch per path, by identity: the end of a retired or replaced one is ignored. */
  tokens: Map<string, object>
}

/** One set of watches per project. */
const watchers = new Map<string, ProjectWatcher>()

/** Watch setups in flight, so concurrent callers share one. */
const starting = new Map<string, Promise<void>>()

// ---------- BATCHING CHANGES ----------

// Sends the batched changes for a project as one `fs.changed` event.
// Runs BATCH_MS after the first change of a batch.
function flush(projectId: string): void {
  const state = watchers.get(projectId)
  if (!state) return
  if (state.pending.size === 0 && state.pendingIgnored.size === 0) return

  // Past MAX_BATCH the rest used to be dropped silently (audit L-2): an unzip of 500 files
  // showed 200. Now the message says so, and tabs re-list. Open documents aren't affected:
  // record() tells them about every change as it happens.
  const truncated = state.pending.size > MAX_BATCH
  const changes = [...state.pending.values()].slice(0, MAX_BATCH)
  const ignored = [...state.pendingIgnored]
  state.pending.clear()
  state.pendingIgnored.clear()

  publishSandboxEvent({
    type: "fs.changed",
    projectId,
    changes,
    ...(ignored.length && { ignored }),
    ...(truncated && { truncated: true as const }),
  })
}

// Starts the batch timer for a project if one isn't already running.
// Coalesces bursts (like a build) into a single message.
function schedule(state: ProjectWatcher, projectId: string): void {
  if (state.timer) return
  state.timer = setTimeout(() => {
    const current = watchers.get(projectId)
    if (current) current.timer = undefined
    flush(projectId)
  }, BATCH_MS)
}

// Records one change reported by a watch rooted at `prefix`.
// Ignored areas are summarised by name; real changes are batched and sent to open documents at once.
function record(
  projectId: string,
  prefix: string,
  change: PodFileChange,
): void {
  const state = watchers.get(projectId)
  if (!state) return

  const relative = change.name.replace(/^\.?\//, "")
  if (!relative) return
  const path = prefix ? `${prefix}/${relative}` : relative

  // Removes have no entry, so they're treated as folders; a file named `build` is still reported.
  if (isIgnoredPath(path, change.entry?.isDirectory)) {
    state.pendingIgnored.add(path.split("/")[0]!)
    schedule(state, projectId)
    return
  }

  // Keyed by path so repeated writes in one batch collapse to the latest.
  state.pending.set(path, {
    path,
    type: change.type,
    ...(change.entry && { entry: change.entry }),
  })
  schedule(state, projectId)

  // Unbatched: an open document must hear before its next autosave.
  noteExternalChange(projectId, path, change.type)

  // A deleted top-level folder's watch doesn't end, it goes deaf. Retire it, so the folder
  // gets a fresh watch if it comes back (rm -rf src && git checkout src).
  if (!prefix && (change.type === "remove" || change.type === "rename"))
    retireWatch(state, path)

  // A new top-level folder needs its own recursive watch.
  if (!prefix && change.entry?.isDirectory && change.type === "create") {
    void addWatch(projectId, path, true)
  }
}

// ---------- RESTARTING A WATCH THAT STOPPED ----------

// Checks whether a watch's end was ours: the project unwatched, replaced, or its sandbox gone or swapped.
// Anything else stopped on its own and gets re-armed.
function stoppedByUs(
  projectId: string,
  state: ProjectWatcher,
  sandboxId: string,
): boolean {
  return (
    state.stopping === true ||
    watchers.get(projectId) !== state ||
    getPod(projectId)?.sandboxId !== sandboxId
  )
}

// Schedules a re-arm of a watch that stopped on its own, backing off 1 s, 2 s, 4 s… up to 30 s.
// A silently dead watch used to leave the tree and open editors deaf until the project reopened (audit L-2).
function scheduleRestart(
  projectId: string,
  path: string,
  state: ProjectWatcher,
  sandboxId: string,
  why: string,
): void {
  const ranFor = Date.now() - (state.startedAt.get(path) ?? Date.now())
  state.startedAt.delete(path)

  const restart = state.restarts.get(path) ?? { attempts: 0 }
  if (ranFor >= HEALTHY_AFTER_MS) restart.attempts = 0
  const delay = Math.min(RESTART_MIN_MS * 2 ** restart.attempts, RESTART_MAX_MS)
  restart.attempts += 1

  clearTimeout(restart.timer)
  restart.timer = setTimeout(
    () => void rearm(projectId, path, state, sandboxId),
    delay,
  )
  restart.timer.unref?.()
  state.restarts.set(path, restart)

  console.warn(
    `[watch] ${projectId}: the watch on "${path || "/"}" stopped (${why}); restarting in ${delay / 1000} s`,
  )
}

// Re-arms a watch, then catches up on what changed while it was down.
// A folder that no longer exists isn't retried; if it's recreated, the root watch starts a new one.
async function rearm(
  projectId: string,
  path: string,
  state: ProjectWatcher,
  sandboxId: string,
): Promise<void> {
  if (stoppedByUs(projectId, state, sandboxId)) return

  if (path) {
    const stillThere = await provider
      .listPodFiles(sandboxId, `${PROJECT_ROOT}/${path}`, 1)
      .catch(() => undefined)
    if (!stillThere) {
      state.restarts.delete(path)
      return
    }
  }

  const started = await addWatch(projectId, path, path !== "")
  if (!started) {
    if (!stoppedByUs(projectId, state, sandboxId))
      scheduleRestart(projectId, path, state, sandboxId, "could not re-arm")
    return
  }

  // Changes during the gap were never reported: tabs re-list (the same signal as a cut-short
  // batch), and open documents compare themselves with disk once.
  publishSandboxEvent({
    type: "fs.changed",
    projectId,
    changes: [],
    truncated: true,
  })
  recheckOpenDocuments(projectId, path)
  console.log(`[watch] ${projectId}: the watch on "${path || "/"}" is back`)
}

// Handles a watch ending: ours (unwatch, replaced sandbox, retired folder) stays quiet; anything else is restarted.
function handleWatchStopped(
  projectId: string,
  path: string,
  state: ProjectWatcher,
  sandboxId: string,
  token: object,
  error?: Error,
): void {
  // A watch that was retired or replaced since: its end means nothing.
  if (state.tokens.get(path) !== token) return
  state.tokens.delete(path)
  state.watchers.delete(path)
  if (stoppedByUs(projectId, state, sandboxId)) return
  scheduleRestart(
    projectId,
    path,
    state,
    sandboxId,
    error?.message ?? "the stream ended",
  )
}

// Stops and forgets a folder's watch on purpose (the folder was deleted or moved away).
// Its end is then ignored, and nothing restarts it unless the folder comes back.
function retireWatch(state: ProjectWatcher, path: string): void {
  clearTimeout(state.restarts.get(path)?.timer)
  state.restarts.delete(path)
  state.tokens.delete(path)
  state.startedAt.delete(path)
  const watcher = state.watchers.get(path)
  state.watchers.delete(path)
  void watcher?.stop().catch(() => undefined)
}

// ---------- STARTING AND STOPPING WATCHES ----------

// Starts one watch on a project folder and remembers it (already-watched paths are skipped).
// The slot is claimed before awaiting so duplicate events don't open two streams. Returns whether it's up.
async function addWatch(
  projectId: string,
  path: string,
  recursive: boolean,
): Promise<boolean> {
  const state = watchers.get(projectId)
  const pod = getPod(projectId)
  if (!state || !pod || state.watchers.has(path)) return false

  const sandboxId = pod.sandboxId
  const token = {}
  state.watchers.set(path, undefined)
  state.tokens.set(path, token)

  try {
    const watcher = await provider.watchPodDir(
      sandboxId,
      path ? `${PROJECT_ROOT}/${path}` : PROJECT_ROOT,
      {
        recursive,
        onChange: (change) => record(projectId, path, change),
        onStop: (error) =>
          handleWatchStopped(projectId, path, state, sandboxId, token, error),
      },
    )

    // Unwatched, or retired while it was starting: stop it again.
    if (watchers.get(projectId) !== state || state.tokens.get(path) !== token) {
      await watcher.stop().catch(() => undefined)
      return false
    }
    state.watchers.set(path, watcher)
    state.startedAt.set(path, Date.now())
    return true
  } catch (error) {
    if (state.tokens.get(path) === token) {
      state.tokens.delete(path)
      state.watchers.delete(path)
    }
    console.error(
      `[watch] ${projectId}: could not watch "${path || "/"}":`,
      error,
    )
    return false
  }
}

// Watches the root non-recursively plus each non-ignored top-level folder recursively.
// This keeps node_modules out entirely: one npm install is tens of thousands of events.
async function start(projectId: string): Promise<void> {
  const pod = getPod(projectId)
  if (!pod) return

  const state: ProjectWatcher = {
    watchers: new Map(),
    pending: new Map(),
    pendingIgnored: new Set(),
    startedAt: new Map(),
    restarts: new Map(),
    tokens: new Map(),
  }
  watchers.set(projectId, state)

  try {
    const entries = await provider.listPodFiles(pod.sandboxId, PROJECT_ROOT, 1)
    await addWatch(projectId, "", false)

    for (const entry of entries ?? []) {
      if (!entry.isDirectory) continue
      const name = entry.path.slice(PROJECT_ROOT.length + 1)
      if (isIgnoredPath(name, true)) continue
      await addWatch(projectId, name, true)
    }
  } catch (error) {
    if (watchers.get(projectId) === state) watchers.delete(projectId)
    console.error(`[watch] ${projectId}: could not start watching:`, error)
  }
}

// Makes sure a project's filesystem is being watched.
// Called when a pod opens, since the watch keeps everyone's file tree honest.
export async function watchProject(projectId: string): Promise<void> {
  // Check in-flight first: start() registers the project before its streams are up.
  const inFlight = starting.get(projectId)
  if (inFlight) return inFlight

  if (watchers.has(projectId)) return

  const work = start(projectId)
  starting.set(projectId, work)
  try {
    await work
  } finally {
    starting.delete(projectId)
  }
}

// Stops every watch for a project.
// Called when its pod goes away.
export async function unwatchProject(projectId: string): Promise<void> {
  const state = watchers.get(projectId)
  if (!state) return

  state.stopping = true
  watchers.delete(projectId)
  clearTimeout(state.timer)
  for (const restart of state.restarts.values()) clearTimeout(restart.timer)
  state.restarts.clear()

  await Promise.all(
    [...state.watchers.values()].map((watcher) =>
      watcher?.stop().catch(() => undefined),
    ),
  )
}

// Returns how many watch streams a project has open.
// Used by tests and diagnostics.
export function watchCount(projectId: string): number {
  return watchers.get(projectId)?.watchers.size ?? 0
}

// Checks whether a project is being watched.
// Used by tests and diagnostics.
export function isWatching(projectId: string): boolean {
  return watchers.has(projectId)
}
