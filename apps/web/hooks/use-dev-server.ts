"use client"

import { useCallback, useEffect, useState } from "react"

import type {
  DevServerState,
  DevServerStatus,
  SandboxEvent,
  TerminalCommandInput,
} from "@forgeAI/shared"

import { useProjectSocket } from "@/hooks/use-project-socket"

/** Build-log lines kept for the starting panel. */
const MAX_LOG_LINES = 200

interface Snapshot {
  state: DevServerState
  previewUrl?: string
  message?: string
  /** Who pressed Start. */
  startedBy?: string
}

export interface DevServer extends Snapshot {
  /** What the server has printed, for the panel shown while it starts. */
  logs: string[]
  start: (command: string, port: number, installCommand?: string) => void
  stop: () => void
  /** Whether the Start dialog is open (shared by the tab-bar control and the Preview error panel). */
  dialogOpen: boolean
  openDialog: () => void
  closeDialog: () => void
}

// Applies a `dev.status` event to the previous snapshot.
// Keeps the preview URL through `starting` and drops it (and the starter) once stopped.
function nextSnapshot(
  event: Extract<SandboxEvent, { type: "dev.status" }>,
  prev: Snapshot | null,
): Snapshot {
  return {
    state: event.state,
    previewUrl:
      event.previewUrl ??
      (event.state === "stopped" ? undefined : prev?.previewUrl),
    message: event.message,
    startedBy:
      event.state === "stopped"
        ? undefined
        : (event.startedBy ?? prev?.startedBy),
  }
}

// Appends non-empty log lines, keeping only the most recent MAX_LOG_LINES.
// Bounds memory for servers that log every request.
function appendLogLines(current: string[], data: string): string[] {
  const lines = [...current, ...data.split("\n").filter((l) => l.trim())]
  return lines.length > MAX_LOG_LINES ? lines.slice(-MAX_LOG_LINES) : lines
}

// Follows the project's dev server: seeded from the pod, then updated by `dev.status` events.
// A newer seed (after a reap or reconnect) wins over events heard before it.
export function useDevServer(
  projectId: string,
  initial: DevServerStatus | undefined,
): DevServer {
  const socket = useProjectSocket()

  // Remembers which seed each reported status arrived under, so a newer seed wins.
  const [reported, setReportedUnder] = useState<{
    seed: DevServerStatus | undefined
    snapshot: Snapshot
  } | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)

  const current =
    reported && reported.seed === initial ? reported.snapshot : null
  const setReported = useCallback(
    (next: Snapshot | null | ((prev: Snapshot | null) => Snapshot)) =>
      setReportedUnder((was) => {
        const prev = was && was.seed === initial ? was.snapshot : null
        const value = typeof next === "function" ? next(prev) : next
        return value ? { seed: initial, snapshot: value } : null
      }),
    [initial],
  )

  const snapshot: Snapshot = current ?? {
    state: initial?.state ?? "stopped",
    previewUrl: initial?.previewUrl,
    startedBy: initial?.startedBy,
  }

  useEffect(() => {
    if (!socket) return

    // Applies dev.status, dev.log and sandbox.reset events for this project.
    const onEvent = (event: SandboxEvent) => {
      if (event.projectId !== projectId) return

      // The orchestrator restarted: forget what the old process reported.
      if (event.type === "sandbox.reset") {
        setReported(null)
        return
      }

      if (event.type === "dev.status") {
        setReported((prev) => nextSnapshot(event, prev))
        // A new run starts a new log.
        if (event.state === "starting") setLogs([])
        return
      }

      if (event.type === "dev.log") {
        setLogs((current) => appendLogLines(current, event.data))
      }
    }

    socket.on("sandbox:event", onEvent)
    return () => {
      socket.off("sandbox:event", onEvent)
    }
  }, [socket, projectId, setReported])

  const send = useCallback(
    (command: TerminalCommandInput) => {
      socket?.emit("terminal:command", command)
    },
    [socket],
  )

  const start = useCallback(
    (command: string, port: number, installCommand?: string) => {
      // Optimistic; the orchestrator's own `dev.status` follows moments later.
      setReported({ state: "starting" })
      setLogs([])
      // installCommand only phrases the "dependency missing" error.
      send({
        type: "dev.start",
        command,
        port,
        ...(installCommand && { installCommand }),
      })
    },
    [send, setReported],
  )

  const stop = useCallback(() => {
    send({ type: "dev.stop" })
  }, [send])

  const openDialog = useCallback(() => setDialogOpen(true), [])
  const closeDialog = useCallback(() => setDialogOpen(false), [])

  return { ...snapshot, logs, start, stop, dialogOpen, openDialog, closeDialog }
}
