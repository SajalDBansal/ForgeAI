"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { SandboxEvent, SandboxFileChange } from "@forgeAI/shared"
import { ignoredFolderKind } from "@forgeAI/shared/types/ignored-folders"

import type { PodFile } from "@/lib/types"
import { listProjectFilesRequest, readProjectFileRequest } from "@/lib/sandbox"
import { useProjectSocket } from "@/hooks/use-project-socket"

/** Levels fetched on first load: the top level plus each folder's contents. */
const INITIAL_DEPTH = 2

/** The tree's root; the project root's children live under the empty string. */
const ROOT = ""

/** Shortest gap between re-lists caused by cut-short watcher messages (an unzip sends many). */
const REFRESH_THROTTLE_MS = 1_000

export interface ProjectFiles {
  /** Children of a folder, or undefined when it has not been listed yet. */
  childrenOf: (folder: string) => PodFile[] | undefined
  /** How many of a folder's entries weren't sent because it's too big to list in full. */
  omittedIn: (folder: string) => number
  isExpanded: (folder: string) => boolean
  toggle: (folder: string) => void
  /** Contents of a file, or undefined while it is still arriving. */
  contents: (path: string) => string | undefined
  open: (path: string) => void
  /** Re-lists open folders after a reconnect and forgets collapsed ones. */
  refresh: () => void
  error: string | null
}

interface State {
  /** Which project this tree belongs to. */
  projectId: string
  folders: Map<string, PodFile[]>
  /** Folder -> entries left out of its listing. */
  omitted: Map<string, number>
  expanded: Set<string>
  files: Map<string, string>
  error: string | null
}

type Folders = Map<string, PodFile[]>

// Creates an empty tree for a project with only the root expanded.
// Used initially and whenever the project changes.
function empty(projectId: string): State {
  return {
    projectId,
    folders: new Map(),
    omitted: new Map(),
    expanded: new Set([ROOT]),
    files: new Map(),
    error: null,
  }
}

// Returns the folder that contains a project-relative path.
// Top-level entries belong to ROOT.
function parentOf(path: string): string {
  const cut = path.lastIndexOf("/")
  return cut === -1 ? ROOT : path.slice(0, cut)
}

// Sorts folders first, then by name.
// The order the file tree renders in.
function compareEntries(a: PodFile, b: PodFile): number {
  return a.isDirectory === b.isDirectory
    ? a.name.localeCompare(b.name)
    : a.isDirectory
      ? -1
      : 1
}

// Splits a (possibly multi-level) listing into one entry list per parent folder.
// The requested folder is always present, even when empty.
function groupByParent(folder: string, entries: PodFile[]): Folders {
  const grouped: Folders = new Map([[folder, []]])
  for (const entry of entries) {
    const parent = parentOf(entry.path)
    const bucket = grouped.get(parent)
    if (bucket) bucket.push(entry)
    else grouped.set(parent, [entry])
  }
  return grouped
}

// Removes a deleted/renamed-away path from its folder, plus any listings inside it.
// Returns false when the path wasn't in the tree.
function removeEntry(
  folders: Folders,
  parent: string,
  siblings: PodFile[],
  path: string,
): boolean {
  const without = siblings.filter((entry) => entry.path !== path)
  if (without.length === siblings.length) return false
  folders.set(parent, without)
  for (const key of folders.keys()) {
    if (key === path || key.startsWith(`${path}/`)) folders.delete(key)
  }
  return true
}

// Adds a new entry in sorted position, or updates size/time of an existing one in place.
// Updating in place keeps the list stable while a build rewrites the same files.
function upsertEntry(
  folders: Folders,
  parent: string,
  siblings: PodFile[],
  entry: PodFile,
): void {
  const existing = siblings.findIndex((sibling) => sibling.path === entry.path)
  if (existing === -1) {
    folders.set(parent, [...siblings, entry].sort(compareEntries))
    return
  }
  const next = [...siblings]
  next[existing] = {
    ...siblings[existing]!,
    size: entry.size,
    modifiedAt: entry.modifiedAt,
  }
  folders.set(parent, next)
}

// Builds the tree entry for a created or written path from a watcher change.
// Missing entry details fall back to a file of size 0 modified now.
function entryFromChange(change: SandboxFileChange, parent: string): PodFile {
  return {
    name: change.path.slice(parent === ROOT ? 0 : parent.length + 1),
    path: change.path,
    isDirectory: change.entry?.isDirectory ?? false,
    size: change.entry?.size ?? 0,
    modifiedAt: change.entry?.modifiedAt ?? Date.now(),
  }
}

// Applies watcher changes to already-listed folders only; returns null when nothing changed.
// Unlisted folders are skipped: they'll be fetched fresh when opened.
function applyFileChanges(
  current: Folders,
  changes: SandboxFileChange[],
): Folders | null {
  const folders = new Map(current)
  let touched = false

  for (const change of changes) {
    const parent = parentOf(change.path)
    const siblings = folders.get(parent)
    if (!siblings) continue

    // A rename arrives as two events, so removing the away-side is the whole of it.
    if (change.type === "remove" || change.type === "rename") {
      if (removeEntry(folders, parent, siblings, change.path)) touched = true
      continue
    }

    upsertEntry(folders, parent, siblings, entryFromChange(change, parent))
    touched = true
  }

  return touched ? folders : null
}

// The project's file tree, loaded folder by folder and kept live by the sandbox watcher.
// Stored as a flat folder->entries map so one change re-renders one folder.
export function useProjectFiles(
  projectId: string,
  ready: boolean,
): ProjectFiles {
  const socket = useProjectSocket()
  const [stored, setStored] = useState<State>(() => empty(projectId))

  // Derived rather than reset in an effect, so a new project never flashes the old tree.
  const state = stored.projectId === projectId ? stored : empty(projectId)

  // Folders already requested per project (a ref so it survives StrictMode's double effects).
  const requested = useRef<Map<string, Set<string>>>(new Map())
  const alreadyAsked = useCallback((id: string): Set<string> => {
    const existing = requested.current.get(id)
    if (existing) return existing
    const fresh = new Set<string>()
    requested.current.set(id, fresh)
    return fresh
  }, [])

  const load = useCallback(
    async (folder: string, depth: number) => {
      const asked = alreadyAsked(projectId)
      if (asked.has(folder)) return
      asked.add(folder)

      const result = await listProjectFilesRequest(projectId, {
        path: folder || undefined,
        depth,
      })

      if (!result.ok) {
        // Allow a retry: failing once doesn't mean it doesn't exist.
        asked.delete(folder)
        setStored((current) =>
          current.projectId === projectId
            ? { ...current, error: result.message }
            : current,
        )
        return
      }

      setStored((current) => {
        if (current.projectId !== projectId) return current

        // Folders that appear as parents were fully listed; ones that appear only as entries were not.
        const folders = new Map(current.folders)
        const omitted = new Map(current.omitted)
        for (const [parent, entries] of groupByParent(
          folder,
          result.data.files,
        )) {
          folders.set(parent, entries)
          const left = result.data.truncated[parent]
          if (left) omitted.set(parent, left)
          else omitted.delete(parent)
        }

        return { ...current, folders, omitted, error: null }
      })

      for (const entry of result.data.files) {
        if (entry.isDirectory) continue
        asked.add(parentOf(entry.path))
      }
    },
    [projectId, alreadyAsked],
  )

  useEffect(() => {
    if (!ready) return
    // `load` only sets state after its request returns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(ROOT, INITIAL_DEPTH)
  }, [ready, load])

  const applyChanges = useCallback((changes: SandboxFileChange[]) => {
    setStored((current) => {
      const folders = applyFileChanges(current.folders, changes)
      return folders ? { ...current, folders } : current
    })
  }, [])

  // The latest refresh, for the watcher handler, which is set up before refresh is defined.
  const refreshRef = useRef<() => void>(() => {})
  const lastRefreshAt = useRef(0)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )

  // Re-lists the open folders at most once per REFRESH_THROTTLE_MS, always once more after a burst.
  // A long unzip sends a cut-short message every 150 ms; one re-list per second covers them all.
  const requestRefresh = useCallback(() => {
    if (refreshTimer.current) return
    const wait = Math.max(
      0,
      lastRefreshAt.current + REFRESH_THROTTLE_MS - Date.now(),
    )
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = undefined
      lastRefreshAt.current = Date.now()
      refreshRef.current()
    }, wait)
  }, [])

  useEffect(() => () => clearTimeout(refreshTimer.current), [])

  useEffect(() => {
    if (!socket) return

    // Patches the tree from fs.changed events.
    const onEvent = (event: SandboxEvent) => {
      if (event.type !== "fs.changed" || event.projectId !== projectId) return
      applyChanges(event.changes)

      // More changed than the message could carry: what's on screen may be missing files.
      if (event.truncated) requestRefresh()

      // An ignored folder (node_modules, .next…) was created or deleted at the top. Nothing inside
      // them is watched, so this only fires for the folder itself: re-list so its hidden row
      // appears or goes away.
      if (event.ignored?.some((name) => ignoredFolderKind(name)))
        requestRefresh()
    }

    socket.on("sandbox:event", onEvent)
    return () => {
      socket.off("sandbox:event", onEvent)
    }
  }, [socket, projectId, applyChanges, requestRefresh])

  const toggle = useCallback(
    (folder: string) => {
      setStored((current) => {
        if (current.projectId !== projectId) return current
        const expanded = new Set(current.expanded)
        if (expanded.has(folder)) expanded.delete(folder)
        else expanded.add(folder)
        return { ...current, expanded }
      })
      // Only fetches the first time a folder is opened.
      void load(folder, 1)
    },
    [load, projectId],
  )

  const open = useCallback(
    (path: string) => {
      void (async () => {
        const result = await readProjectFileRequest(projectId, path)

        setStored((current) => {
          if (current.projectId !== projectId) return current
          if (!result.ok) return { ...current, error: result.message }
          return {
            ...current,
            files: new Map(current.files).set(path, result.data.content),
            error: null,
          }
        })
      })()
    },
    [projectId],
  )

  const refresh = useCallback(() => {
    // The sandbox being opened will list the tree when it's ready.
    if (!ready) return
    const expanded = [...state.expanded]
    setStored((current) => {
      if (current.projectId !== projectId) return current
      // Drop collapsed folders so they're fetched fresh when next opened.
      const folders = new Map(
        [...current.folders].filter(([folder]) => current.expanded.has(folder)),
      )
      return { ...current, folders }
    })
    alreadyAsked(projectId).clear()
    for (const folder of expanded) void load(folder, 1)
  }, [ready, state.expanded, projectId, alreadyAsked, load])

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  return {
    // `undefined` means "not listed yet", shown as loading.
    childrenOf: useCallback(
      (folder) => state.folders.get(folder),
      [state.folders],
    ),
    omittedIn: useCallback(
      (folder) => state.omitted.get(folder) ?? 0,
      [state.omitted],
    ),
    isExpanded: useCallback(
      (folder) => state.expanded.has(folder),
      [state.expanded],
    ),
    toggle,
    contents: useCallback((path) => state.files.get(path), [state.files]),
    open,
    refresh,
    error: state.error,
  }
}
