"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import * as Y from "yjs"

import type {
  DocConflictReason,
  SandboxEvent,
  TerminalCommandInput,
} from "@forgeAI/shared"

import { useProjectSocket } from "@/hooks/use-project-socket"
import { displayToast } from "@/lib/toast"

/** Where this file stands between the editor and the sandbox. */
export type SaveState = "clean" | "unsaved" | "saved"

export interface SharedDocument {
  /** The Yjs text Monaco binds to, or null until the first sync arrives. */
  text: Y.Text | null
  /** Why the file could not be opened, if it could not. */
  error: string | null
  /** Whether there is anything on disk waiting to catch up. */
  saveState: SaveState
  /** When the orchestrator last wrote this file. */
  savedAt: string | null
  /** Set when disk and document diverged; autosave is off until answered. */
  conflict: DocConflictReason | null
  /** Ctrl+S / blur: asks the orchestrator to save now (this tab never writes). */
  save: () => void
  /** Answer a conflict: keep the document, or reload the file. */
  resolve: (keep: "mine" | "disk") => void
}

const LOST_EDITS_MESSAGE =
  "This file was reopened because its sandbox changed. Your last few keystrokes may not have been saved."

// Encodes a binary Yjs update as base64 for the JSON socket channel.
// Used for every update and state vector this tab sends.
const encode = (update: Uint8Array): string => {
  let binary = ""
  for (const byte of update) binary += String.fromCharCode(byte)
  return btoa(binary)
}

// Decodes a base64 Yjs update from the socket back to bytes.
// Used for every sync and update this tab receives.
const decode = (update: string): Uint8Array => {
  const binary = atob(update)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const EMPTY: SharedDocument = {
  text: null,
  error: null,
  saveState: "clean",
  savedAt: null,
  conflict: null,
  save: () => {},
  resolve: () => {},
}

// Keeps a local Yjs replica of one file in sync with the orchestrator's authoritative document.
// Edits go up as mergeable updates; only the orchestrator ever writes the file to disk.
export function useSharedDocument(
  projectId: string,
  path: string,
  canWrite: boolean,
  /** The sandbox the document lives in; a new id means reopen (the old document is gone). */
  sandboxId: string | null,
): SharedDocument {
  const socket = useProjectSocket()
  const [state, setState] = useState<{
    path: string
    text: Y.Text | null
    error: string | null
    saveState: SaveState
    savedAt: string | null
    conflict: DocConflictReason | null
  }>({
    path,
    text: null,
    error: null,
    saveState: "clean",
    savedAt: null,
    conflict: null,
  })

  /** The live document; a ref so updates don't re-render on every keystroke. */
  const docRef = useRef<{ path: string; doc: Y.Doc } | null>(null)

  /** Sends to the orchestrator; a ref so `save` keeps a stable identity for Monaco's keybinding. */
  const sendRef = useRef<((command: TerminalCommandInput) => void) | null>(null)

  useEffect(() => {
    // Without a sandbox there's nothing to open.
    if (!socket || !path || !sandboxId) return

    const send = (command: TerminalCommandInput) =>
      socket.emit("terminal:command", command)
    sendRef.current = send

    /** The server document this copy belongs to; null until the first `doc.sync`. */
    let epoch: string | null = null
    /** Local edits not yet confirmed by a `doc.saved`. */
    let unconfirmed = false

    // Warns once if a reset is about to throw away unconfirmed local edits.
    const warnLostEdits = () => {
      if (unconfirmed && canWrite) displayToast(LOST_EDITS_MESSAGE)
      unconfirmed = false
    }

    // Sends local edits to the orchestrator and marks the file unsaved.
    const onLocalUpdate = (update: Uint8Array, origin: unknown) => {
      // Remote updates also fire this; don't echo them back.
      if (origin === "remote" || !canWrite) return
      // Monaco isn't bound until the first sync, so nothing is lost here.
      if (epoch === null) return
      send({ type: "doc.update", path, update: encode(update), epoch })
      unconfirmed = true
      setState((prev) =>
        prev.saveState === "unsaved"
          ? prev
          : { ...prev, path, saveState: "unsaved" },
      )
    }

    let doc = new Y.Doc()
    // Replaces the local copy with an empty one, bound to nothing until a sync arrives.
    const fresh = () => {
      doc.off("update", onLocalUpdate)
      doc.destroy()
      doc = new Y.Doc()
      doc.on("update", onLocalUpdate)
      docRef.current = { path, doc }
      epoch = null
    }
    doc.on("update", onLocalUpdate)
    docRef.current = { path, doc }

    // Discards this copy and opens the file again (the server's document changed).
    const reopen = () => {
      warnLostEdits()
      fresh()
      setState((prev) => ({
        ...prev,
        path,
        text: null,
        saveState: "clean",
        conflict: null,
      }))
      send({ type: "doc.open", path })
    }

    // Handles doc.* events for this file: sync, update, save, conflict, reset and errors.
    const onEvent = (event: SandboxEvent) => {
      if (event.projectId !== projectId) return
      if (!("path" in event) || event.path !== path) return

      if (event.type === "doc.error") {
        setState((prev) => ({
          ...prev,
          path,
          text: null,
          error: event.message,
        }))
        return
      }

      if (event.type === "doc.saved") {
        // The shared document was saved, which is true for every tab.
        unconfirmed = false
        setState((prev) => ({
          ...prev,
          path,
          saveState: "saved",
          savedAt: event.at,
        }))
        return
      }

      if (event.type === "doc.conflict") {
        setState((prev) => ({ ...prev, path, conflict: event.reason }))
        return
      }

      if (event.type === "doc.reset") {
        // Our own doc.open is already in flight, or the reset is for another copy.
        if (epoch === null) return
        if (event.epoch !== null && event.epoch === epoch) return
        reopen()
        return
      }

      if (event.type === "doc.sync") {
        // A sync of a different document replaces ours rather than merging into it.
        if (epoch !== null && event.epoch !== epoch) {
          warnLostEdits()
          fresh()
        }
        Y.applyUpdate(doc, decode(event.update), "remote")
        if (epoch === null) {
          epoch = event.epoch
          setState((prev) => ({
            ...prev,
            path,
            text: doc.getText("content"),
            error: null,
          }))
        }
        return
      }

      if (event.type !== "doc.update") return
      // Before the first sync, the sync will already contain it.
      if (epoch === null) return
      if (event.epoch !== epoch) {
        reopen()
        return
      }
      Y.applyUpdate(doc, decode(event.update), "remote")
    }

    // After a reconnect, exchange state both ways: missed updates come down, unsent edits go up.
    let dropped = false
    const onDisconnect = () => {
      dropped = true
    }
    const onReconnect = () => {
      if (!dropped) return
      dropped = false

      if (epoch === null) {
        send({ type: "doc.open", path })
        return
      }
      send({
        type: "doc.open",
        path,
        epoch,
        stateVector: encode(Y.encodeStateVector(doc)),
      })
      if (canWrite)
        send({
          type: "doc.update",
          path,
          update: encode(Y.encodeStateAsUpdate(doc)),
          epoch,
        })
    }

    socket.on("sandbox:event", onEvent)
    socket.on("disconnect", onDisconnect)
    socket.on("connect", onReconnect)
    send({ type: "doc.open", path })

    return () => {
      socket.off("sandbox:event", onEvent)
      socket.off("disconnect", onDisconnect)
      socket.off("connect", onReconnect)
      doc.off("update", onLocalUpdate)
      // Lets the orchestrator flush now if this was the last editor.
      send({ type: "doc.close", path })
      doc.destroy()
      docRef.current = null
      sendRef.current = null
    }
  }, [socket, projectId, path, canWrite, sandboxId])

  const save = useCallback(() => {
    if (!canWrite) return
    sendRef.current?.({ type: "doc.save", path })
  }, [canWrite, path])

  const resolve = useCallback(
    (keep: "mine" | "disk") => {
      if (!canWrite) return
      sendRef.current?.({ type: "doc.resolve", path, keep })
      setState((prev) => ({ ...prev, conflict: null }))
    },
    [canWrite, path],
  )

  // A different file: derived so no render shows one file's state under another's name.
  if (state.path !== path) return { ...EMPTY, save, resolve }

  return {
    text: state.text,
    error: state.error,
    saveState: state.saveState,
    savedAt: state.savedAt,
    conflict: state.conflict,
    save,
    resolve,
  }
}
