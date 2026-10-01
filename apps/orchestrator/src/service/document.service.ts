import { randomUUID } from "node:crypto"

import { FileNotFoundError } from "@forgeAI/sandbox-provider"
import * as Y from "yjs"

import {
  PROJECT_ROOT,
  resolveProjectPath,
  type AgentEditFileDataType,
  type AgentEditFileResult,
  type DocConflictReason,
  type DocEpoch,
  type SandboxFileChange,
  type TerminalCommand,
} from "@forgeAI/shared"

import { ENV_CONFIG } from "../envConfig.js"
import { EDITOR_READ, editorReadRefusal } from "../lib/file-limits.js"
import { publishSandboxEvent } from "../lib/redis.js"
import {
  clearProjectPresence,
  isPathOpen,
  noteAgentEditing,
  notePresenceClose,
  notePresenceEditing,
  notePresenceOpen,
  type PresenceSource,
} from "./presence.service.js"
import { getPod, markProjectDirty } from "../state.js"
import { touchPod } from "./activity.service.js"
import { provider } from "../lib/provider.js"

/** Name of the shared text inside each Yjs document. */
const TEXT = "content"

/** Debounce before writing to the sandbox; short so a restart loses at most ~2 s of typing. */
const FLUSH_AFTER_MS = 2_000

/** How long a document nobody has open is kept before it is saved and freed. */
const IDLE_CLOSE_MS = ENV_CONFIG.DOC_IDLE_CLOSE_MINUTES * 60_000

/** How often unused documents are looked for. */
const IDLE_SWEEP_MS = 60_000

interface SharedDocument {
  doc: Y.Doc
  /** Random id of this document incarnation; updates from any other epoch are refused. */
  epoch: DocEpoch
  /** File contents as last read or written; the exact stamp for "did disk change behind us?". */
  lastWritten: string
  flush?: ReturnType<typeof setTimeout>
  /** Set when disk and document both changed; nothing is written until `doc.resolve`. */
  conflict?: DocConflictReason
  /** A reconcile read is in flight. */
  checking?: boolean
  /** A change that arrived during `checking`; reconciled again once it finishes. */
  recheck?: SandboxFileChange["type"]
  /** The write in progress; writes are chained so the newest text always lands last. */
  writing?: Promise<boolean>
  /** Last open, edit, save or merged disk change (epoch ms); the idle sweep's clock. */
  lastUsedAt: number
}

type DocumentCommand = Extract<
  TerminalCommand,
  { type: "doc.open" | "doc.update" | "doc.close" | "doc.save" | "doc.resolve" }
>
export type AgentDocumentEditOutcome =
  | { ok: true; data: AgentEditFileResult }
  | {
      ok: false
      reason: "no_pod" | "not_found" | "conflict" | "search_missing"
      detail?: string
    }

/** One authoritative Yjs document per open file, keyed by `projectId\0path`. Lives only here. */
const documents = new Map<string, SharedDocument>()

// ---------- THE DOCUMENTS ----------

// Builds the map key for a project's file.
// NUL can't occur in either part, so keys never collide.
function keyFor(projectId: string, path: string): string {
  return `${projectId}\0${path}`
}

// Encodes a binary Yjs update as base64 for the JSON channel.
const encode = (update: Uint8Array): string =>
  Buffer.from(update).toString("base64")
// Decodes a base64 Yjs update back to bytes.
const decode = (update: string): Uint8Array =>
  new Uint8Array(Buffer.from(update, "base64"))

// Publishes a document error for the project's tabs.
// Used when a file can't be opened or reloaded.
function publishDocError(
  projectId: string,
  path: string,
  message: string,
): void {
  publishSandboxEvent({ type: "doc.error", projectId, path, message })
}

// Cancels a document's pending debounced write.
// Used before an immediate save, a close, or a conflict.
function cancelPendingFlush(shared: SharedDocument): void {
  clearTimeout(shared.flush)
  shared.flush = undefined
}

// ---------- LOADING AND SAVING ----------

// Loads a file into a shared document, or returns the one already open.
// The file is read once per file, not once per person.
async function openDocument(
  projectId: string,
  path: string,
): Promise<SharedDocument | undefined> {
  const key = keyFor(projectId, path)
  const existing = documents.get(key)
  if (existing) return existing

  const pod = getPod(projectId)
  const absolute = resolveProjectPath(path)
  if (!pod || !absolute) return undefined

  // Capped: one click on a huge log must not load it into this process's memory.
  const contents = await provider.readFileFromPod(
    pod.sandboxId,
    absolute,
    EDITOR_READ,
  )

  // Re-check after the await: a concurrent open may have created it already.
  const raced = documents.get(key)
  if (raced) return raced

  const doc = new Y.Doc()
  doc.getText(TEXT).insert(0, contents)

  const shared: SharedDocument = {
    doc,
    epoch: randomUUID(),
    lastWritten: contents,
    lastUsedAt: Date.now(),
  }
  documents.set(key, shared)
  return shared
}

// Queues a write of the document to the sandbox; returns whether it actually wrote.
// The orchestrator is the only writer, so tabs never clobber each other's saves.
async function flush(
  projectId: string,
  path: string,
  force = false,
): Promise<boolean> {
  const shared = documents.get(keyFor(projectId, path))
  if (!shared) return false

  const run = (shared.writing ?? Promise.resolve(false))
    .catch(() => false)
    .then(() => writeNow(projectId, path, force))
  shared.writing = run
  return run
}

// Writes the document's current text to disk unless unchanged or in conflict.
// `force` is doc.resolve choosing "mine", which overrides the conflict.
async function writeNow(
  projectId: string,
  path: string,
  force: boolean,
): Promise<boolean> {
  const shared = documents.get(keyFor(projectId, path))
  const pod = getPod(projectId)
  const absolute = resolveProjectPath(path)
  if (!shared || !pod || !absolute) return false

  if (shared.conflict && !force) return false

  const text = shared.doc.getText(TEXT).toString()
  if (text === shared.lastWritten && !force) return false

  try {
    await provider.writeFileToPod(pod.sandboxId, absolute, text)
    shared.lastWritten = text
    markProjectDirty(projectId)
    publishSandboxEvent({
      type: "doc.saved",
      projectId,
      path,
      at: new Date().toISOString(),
      actor: "user",
    })
    return true
  } catch (error) {
    console.error(`[doc] could not write ${path} for ${projectId}:`, error)
    return false
  }
}

// ---------- CHANGES MADE ON DISK ----------

// Measures how many characters two strings share at the start and at the end.
// Lets a disk change be applied as one small replacement instead of a full rewrite.
function commonAffixLengths(
  current: string,
  next: string,
): { start: number; end: number } {
  let start = 0
  while (
    start < current.length &&
    start < next.length &&
    current[start] === next[start]
  )
    start += 1

  let end = 0
  while (
    end < current.length - start &&
    end < next.length - start &&
    current[current.length - 1 - end] === next[next.length - 1 - end]
  ) {
    end += 1
  }
  return { start, end }
}

// Replaces the document's text with the disk contents as a minimal edit, and broadcasts it.
// Used for disk reloads and agent edits, so cursors elsewhere don't jump.
function replaceDocumentText(
  shared: SharedDocument,
  projectId: string,
  path: string,
  contents: string,
  written: boolean,
  origin?: unknown,
): boolean {
  const text = shared.doc.getText(TEXT)
  const current = text.toString()
  if (current === contents) {
    if (written) shared.lastWritten = contents
    return false
  }

  shared.lastUsedAt = Date.now()
  const { start, end } = commonAffixLengths(current, contents)

  // This edit originates here, so capture its update to send to every tab.
  const updates: Uint8Array[] = []
  const collect = (update: Uint8Array) => updates.push(update)

  shared.doc.on("update", collect)
  try {
    shared.doc.transact(() => {
      const removeCount = current.length - start - end
      if (removeCount > 0) text.delete(start, removeCount)
      const insert = contents.slice(start, contents.length - end)
      if (insert) text.insert(start, insert)
    }, origin)
  } finally {
    shared.doc.off("update", collect)
  }

  if (written) shared.lastWritten = contents
  for (const update of updates) {
    publishSandboxEvent({
      type: "doc.update",
      projectId,
      path,
      update: encode(update),
      epoch: shared.epoch,
      actor: origin === "agent" ? "agent" : "user",
    })
  }
  return true
}

// Replaces the document's text with the disk contents and marks the disk as current.
// Only used when the document has no unsaved edits.
function applyFromDisk(
  shared: SharedDocument,
  projectId: string,
  path: string,
  contents: string,
): void {
  replaceDocumentText(shared, projectId, path, contents, true)
}

// Pauses autosave for a document and tells every tab there's a conflict.
// Stays until someone picks a side with doc.resolve.
function raiseConflict(
  shared: SharedDocument,
  projectId: string,
  path: string,
  reason: DocConflictReason,
): void {
  cancelPendingFlush(shared)
  shared.conflict = reason
  publishSandboxEvent({ type: "doc.conflict", projectId, path, reason })
}

// Decides what an outside change to an open file means: our own echo, absorb it, or conflict.
// Compares exact contents, so "it was our own write" is answered precisely.
async function reconcile(
  projectId: string,
  path: string,
  type: SandboxFileChange["type"],
): Promise<void> {
  const shared = documents.get(keyFor(projectId, path))
  if (!shared || shared.conflict) return
  if (shared.checking) {
    shared.recheck = type
    return
  }

  // Writing again would silently undo a deliberate delete.
  if (type === "remove") {
    raiseConflict(shared, projectId, path, "removed")
    return
  }

  const pod = getPod(projectId)
  const absolute = resolveProjectPath(path)
  if (!pod || !absolute) return

  shared.checking = true
  try {
    const contents = await provider.readFileFromPod(
      pod.sandboxId,
      absolute,
      EDITOR_READ,
    )

    // Our own write, echoed back by the watcher.
    if (contents === shared.lastWritten) return

    // Both disk and document moved: a real conflict.
    if (shared.doc.getText(TEXT).toString() !== shared.lastWritten) {
      raiseConflict(shared, projectId, path, "changed")
      return
    }

    applyFromDisk(shared, projectId, path, contents)
  } catch (error) {
    // Gone from disk (deleted while nobody was watching): writing again would undo the delete.
    if (error instanceof FileNotFoundError) {
      raiseConflict(shared, projectId, path, "removed")
      return
    }

    // Grew too big, or turned binary, on disk: it changed and can't be merged. A conflict pauses
    // autosave, which would otherwise overwrite that file with the document's text.
    const refusal = editorReadRefusal(error)
    if (refusal) {
      raiseConflict(shared, projectId, path, "changed")
      publishDocError(projectId, path, refusal)
      return
    }
    console.error(`[doc] could not reconcile ${path} for ${projectId}:`, error)
  } finally {
    shared.checking = false
    const again = shared.recheck
    shared.recheck = undefined
    if (again) void reconcile(projectId, path, again)
  }
}

// Called by the file watcher for every change; ignores files nobody has open.
// Reuses the watcher stream, so noticing external edits costs one map lookup.
export function noteExternalChange(
  projectId: string,
  path: string,
  type: SandboxFileChange["type"],
): void {
  if (!documents.has(keyFor(projectId, path))) return
  void reconcile(projectId, path, type)
}

// Compares every open document under a folder with disk once ("" = the whole project).
// Called after a file watch restarts: changes made while it was down were never reported.
export function recheckOpenDocuments(projectId: string, folder: string): void {
  const prefix = `${projectId}\0`
  for (const key of documents.keys()) {
    if (!key.startsWith(prefix)) continue
    const path = key.slice(prefix.length)
    if (folder && path !== folder && !path.startsWith(`${folder}/`)) continue
    void reconcile(projectId, path, "write")
  }
}

// ---------- AGENT EDITS ----------

function agentEditedText(
  current: string,
  input: AgentEditFileDataType,
): { ok: true; text: string } | { ok: false } {
  if (input.content !== undefined) return { ok: true, text: input.content }

  const search = input.search
  if (!search || input.replace === undefined) return { ok: false }

  const at = current.indexOf(search)
  if (at === -1) return { ok: false }

  return {
    ok: true,
    text: `${current.slice(0, at)}${input.replace}${current.slice(at + search.length)}`,
  }
}

// Applies an agent edit through the editor document when the file is open, otherwise straight to disk.
// This is the same authority path as user edits, so collaborators see open-file changes live.
export async function editFileForAgent(
  projectId: string,
  input: AgentEditFileDataType,
): Promise<AgentDocumentEditOutcome> {
  const pod = getPod(projectId)
  const absolute = resolveProjectPath(input.path)
  if (!pod) return { ok: false, reason: "no_pod" }
  if (!absolute) return { ok: false, reason: "not_found" }

  touchPod(projectId)

  const shared = documents.get(keyFor(projectId, input.path))
  if (shared) {
    noteAgentEditing(projectId, input.path)
    if (shared.conflict) {
      return {
        ok: false,
        reason: "conflict",
        detail: "This file has an unresolved editor conflict.",
      }
    }

    const current = shared.doc.getText(TEXT).toString()
    const edited = agentEditedText(current, input)
    if (!edited.ok)
      return {
        ok: false,
        reason: "search_missing",
        detail: "Search text was not found.",
      }
    if (edited.text === current)
      return {
        ok: true,
        data: { path: input.path, changed: false, openDocument: true },
      }

    cancelPendingFlush(shared)
    replaceDocumentText(
      shared,
      projectId,
      input.path,
      edited.text,
      false,
      "agent",
    )
    const saved = await flush(projectId, input.path)
    if (!saved && shared.doc.getText(TEXT).toString() !== shared.lastWritten)
      scheduleFlush(projectId, input.path)
    return {
      ok: true,
      data: { path: input.path, changed: true, openDocument: true },
    }
  }

  let current = ""
  let exists = true
  try {
    current = await provider.readFileFromPod(
      pod.sandboxId,
      absolute,
      EDITOR_READ,
    )
  } catch (error) {
    if (error instanceof FileNotFoundError && input.content !== undefined) {
      current = ""
      exists = false
    } else if (error instanceof FileNotFoundError)
      return { ok: false, reason: "not_found" }
    else throw error
  }

  const edited = agentEditedText(current, input)
  if (!edited.ok)
    return {
      ok: false,
      reason: "search_missing",
      detail: "Search text was not found.",
    }
  if (exists && edited.text === current)
    return {
      ok: true,
      data: { path: input.path, changed: false, openDocument: false },
    }

  noteAgentEditing(projectId, input.path)
  await provider.writeFileToPod(pod.sandboxId, absolute, edited.text)
  markProjectDirty(projectId)
  return {
    ok: true,
    data: { path: input.path, changed: true, openDocument: false },
  }
}

export function resetOpenDocuments(projectId: string, paths: string[]): void {
  const wanted = new Set(paths)
  const prefix = `${projectId}\0`
  for (const [key, shared] of [...documents.entries()]) {
    if (!key.startsWith(prefix)) continue
    const path = key.slice(prefix.length)
    if (wanted.size > 0 && !wanted.has(path)) continue
    clearTimeout(shared.flush)
    shared.doc.destroy()
    documents.delete(key)
    publishSandboxEvent({ type: "doc.reset", projectId, path, epoch: null })
  }
}

// ---------- WHAT TABS DO ----------

// Restarts the debounce that writes a document after typing pauses.
// Called after every accepted edit.
function scheduleFlush(projectId: string, path: string): void {
  const shared = documents.get(keyFor(projectId, path))
  if (!shared) return

  clearTimeout(shared.flush)
  shared.flush = setTimeout(() => {
    void flush(projectId, path)
  }, FLUSH_AFTER_MS)
}

// Sends a reconnecting tab only the edits it missed, as a doc.update.
// Falls back to the full state if the tab's state vector can't be decoded.
function sendMissedUpdates(
  shared: SharedDocument,
  projectId: string,
  path: string,
  stateVector: string,
): void {
  let missed: Uint8Array
  try {
    missed = Y.encodeStateAsUpdate(shared.doc, decode(stateVector))
  } catch (error) {
    console.error(`[doc] bad state vector for ${path} in ${projectId}:`, error)
    missed = Y.encodeStateAsUpdate(shared.doc)
  }
  // Two bytes is Yjs's encoding of "nothing".
  if (missed.length > 2) {
    publishSandboxEvent({
      type: "doc.update",
      projectId,
      path,
      update: encode(missed),
      epoch: shared.epoch,
    })
  }
}

// Opens a file for a tab: sends the full state, or just missed edits on reconnect.
// Also records presence immediately so others see who picked up the file.
async function openForTab(
  command: Extract<DocumentCommand, { type: "doc.open" }>,
): Promise<void> {
  const { projectId, path } = command

  let shared: SharedDocument | undefined
  try {
    shared = await openDocument(projectId, path)
    // The idle sweep may have freed it while this open waited: sync a live document, never a freed one.
    if (shared && documents.get(keyFor(projectId, path)) !== shared)
      shared = await openDocument(projectId, path)
  } catch (error) {
    publishDocError(
      projectId,
      path,
      editorReadRefusal(error) ??
        (error instanceof Error ? error.message : "Couldn't open this file."),
    )
    return
  }

  if (!shared) {
    publishDocError(projectId, path, "This file is not available.")
    return
  }

  shared.lastUsedAt = Date.now()
  notePresenceOpen(projectId, command, path)

  if (command.epoch === shared.epoch && command.stateVector) {
    sendMissedUpdates(shared, projectId, path, command.stateVector)
    return
  }

  // Sent to the whole room; applying known state is a no-op for everyone else.
  publishSandboxEvent({
    type: "doc.sync",
    projectId,
    path,
    update: encode(Y.encodeStateAsUpdate(shared.doc)),
    epoch: shared.epoch,
  })
}

// Applies a Yjs update and reports whether it changed anything ("error" if it was malformed).
// A re-sent update Yjs already has is a no-op, not typing.
function applyClientUpdate(
  shared: SharedDocument,
  update: string,
  projectId: string,
  path: string,
): boolean | "error" {
  let changed = false
  const noticeChange = () => {
    changed = true
  }
  shared.doc.on("update", noticeChange)
  try {
    Y.applyUpdate(shared.doc, decode(update))
  } catch (error) {
    console.error(`[doc] bad update for ${path} in ${projectId}:`, error)
    return "error"
  } finally {
    shared.doc.off("update", noticeChange)
  }
  return changed
}

// Applies a tab's edit, rebroadcasts it, marks the author as typing and schedules a save.
// Edits against a missing or older document are refused with doc.reset.
function applyTabUpdate(
  command: Extract<DocumentCommand, { type: "doc.update" }>,
): void {
  const { projectId, path } = command
  const shared = documents.get(keyFor(projectId, path))

  // The document is gone (sandbox replaced or restart): tell the tab to reopen.
  if (!shared) {
    publishSandboxEvent({ type: "doc.reset", projectId, path, epoch: null })
    return
  }

  // Made against an older document; merging would duplicate the text.
  if (command.epoch !== shared.epoch) {
    publishSandboxEvent({
      type: "doc.reset",
      projectId,
      path,
      epoch: shared.epoch,
    })
    return
  }

  const changed = applyClientUpdate(shared, command.update, projectId, path)
  if (changed !== true) return

  // Rebroadcast as received: much smaller than re-encoding the whole document.
  publishSandboxEvent({
    type: "doc.update",
    projectId,
    path,
    update: command.update,
    epoch: shared.epoch,
    actor: "user",
  })

  shared.lastUsedAt = Date.now()
  notePresenceEditing(projectId, command, path)
  scheduleFlush(projectId, path)
}

// Writes a document now instead of waiting for the debounce (Ctrl+S, editor blur).
// Only the timing changes; the orchestrator is still the only writer.
async function saveNow(projectId: string, path: string): Promise<void> {
  const shared = documents.get(keyFor(projectId, path))
  if (!shared) return

  shared.lastUsedAt = Date.now()
  cancelPendingFlush(shared)
  await flush(projectId, path)
}

// Settles a disk conflict: "mine" overwrites the file, "disk" reloads it into the document.
// For "disk" the conflict clears only once the read succeeds.
async function resolveConflict(
  projectId: string,
  path: string,
  keep: "mine" | "disk",
): Promise<void> {
  const shared = documents.get(keyFor(projectId, path))
  if (!shared?.conflict) return

  if (keep === "mine") {
    shared.conflict = undefined
    await flush(projectId, path, true)
    return
  }

  const pod = getPod(projectId)
  const absolute = resolveProjectPath(path)
  if (!pod || !absolute) return

  try {
    const contents = await provider.readFileFromPod(
      pod.sandboxId,
      absolute,
      EDITOR_READ,
    )
    shared.conflict = undefined
    applyFromDisk(shared, projectId, path, contents)
  } catch (error) {
    publishDocError(
      projectId,
      path,
      editorReadRefusal(error) ??
        (error instanceof Error ? error.message : "Couldn't reload this file."),
    )
  }
}

// Records that one tab closed a file and writes its latest state.
// The document stays in memory: others may still have it open, and the idle sweep frees it later.
async function closeForTab(
  projectId: string,
  source: PresenceSource,
  path: string,
): Promise<void> {
  notePresenceClose(projectId, source, path)

  const shared = documents.get(keyFor(projectId, path))
  if (shared) {
    cancelPendingFlush(shared)
    await flush(projectId, path)
  }
}

// Routes a doc.* command from a tab to its handler.
// Every document command counts as activity on the project.
export async function handleDocumentCommand(
  command: DocumentCommand,
): Promise<void> {
  touchPod(command.projectId)

  switch (command.type) {
    case "doc.open":
      return openForTab(command)
    case "doc.update":
      return applyTabUpdate(command)
    case "doc.save":
      return saveNow(command.projectId, command.path)
    case "doc.resolve":
      return resolveConflict(command.projectId, command.path, command.keep)
    case "doc.close":
      return closeForTab(command.projectId, command, command.path)
  }
}

// ---------- WHOLE PROJECT ----------

// Writes every open document of a project to its sandbox right now.
// Called before snapshots, commits and shutdown so disk matches what people see.
export async function flushProjectDocuments(
  projectId: string,
): Promise<{ ok: boolean; failed: string[] }> {
  const prefix = `${projectId}\0`
  const paths = [...documents.keys()]
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length))
  const failed: string[] = []

  for (const path of paths) {
    const shared = documents.get(keyFor(projectId, path))
    if (shared) clearTimeout(shared.flush)
    await flush(projectId, path)
    const latest = documents.get(keyFor(projectId, path))
    if (
      latest &&
      (latest.conflict ||
        latest.doc.getText(TEXT).toString() !== latest.lastWritten)
    ) {
      failed.push(path)
    }
  }
  return { ok: failed.length === 0, failed }
}

export async function requireProjectDocumentsFlushed(
  projectId: string,
): Promise<void> {
  const flushed = await flushProjectDocuments(projectId)
  if (!flushed.ok) {
    throw new Error(
      `Open document flush failed for ${flushed.failed.join(", ")}`,
    )
  }
}

// ---------- FREEING UNUSED DOCUMENTS ----------

// Checks whether a document may be freed: nobody has it open, nobody has used it for a while,
// and nothing about it is unfinished (an unresolved conflict holds edits that aren't on disk).
function isIdle(
  projectId: string,
  path: string,
  shared: SharedDocument,
  now: number,
): boolean {
  return (
    !shared.conflict &&
    !shared.checking &&
    now - shared.lastUsedAt >= IDLE_CLOSE_MS &&
    !isPathOpen(projectId, path)
  )
}

// Saves one unused document a last time and frees it, but only once its text is safely on disk.
// Returns whether it was freed; a failed save keeps it for the next sweep.
async function closeIfIdle(key: string): Promise<boolean> {
  const shared = documents.get(key)
  if (!shared) return false
  const split = key.indexOf("\0")
  const projectId = key.slice(0, split)
  const path = key.slice(split + 1)
  if (!isIdle(projectId, path, shared, Date.now())) return false

  cancelPendingFlush(shared)
  await flush(projectId, path)

  // Re-checked after the await: someone may have opened it, typed, or freed it meanwhile.
  if (
    documents.get(key) !== shared ||
    !isIdle(projectId, path, shared, Date.now())
  )
    return false
  if (shared.doc.getText(TEXT).toString() !== shared.lastWritten) return false

  shared.doc.destroy()
  documents.delete(key)
  return true
}

let sweepingIdle = false

// Frees every document nobody has used for IDLE_CLOSE_MS, logging how many per project; exported to force a sweep in tests.
// Without it, every file anyone ever opened stays in memory, history and all, until the pod goes.
export async function closeIdleDocuments(): Promise<void> {
  if (sweepingIdle) return
  sweepingIdle = true
  try {
    const closed = new Map<string, number>()
    for (const key of [...documents.keys()]) {
      const freed = await closeIfIdle(key).catch((error: unknown) => {
        console.error("[doc] could not close an unused document:", error)
        return false
      })
      if (!freed) continue
      const projectId = key.slice(0, key.indexOf("\0"))
      closed.set(projectId, (closed.get(projectId) ?? 0) + 1)
    }
    for (const [projectId, count] of closed) {
      console.log(`[doc] closed ${count} unused document(s) for ${projectId}`)
    }
  } finally {
    sweepingIdle = false
  }
}

setInterval(() => void closeIdleDocuments(), IDLE_SWEEP_MS).unref()

// ---------- WHEN THE SANDBOX GOES AWAY ----------

// Drops all of a project's documents and its presence.
// Called when its pod goes away; the files they describe no longer exist.
export function closeProjectDocuments(projectId: string): void {
  clearProjectPresence(projectId)

  const prefix = `${projectId}\0`
  for (const [key, shared] of documents) {
    if (!key.startsWith(prefix)) continue
    clearTimeout(shared.flush)
    shared.doc.destroy()
    documents.delete(key)
  }
}

// Returns how many documents a project has open.
// Used by tests and to know whether a flush has any work.
export function openDocumentCount(projectId: string): number {
  const prefix = `${projectId}\0`
  return [...documents.keys()].filter((key) => key.startsWith(prefix)).length
}

/** Re-exported so callers needn't import two modules to say where a file is. */
export { PROJECT_ROOT }
