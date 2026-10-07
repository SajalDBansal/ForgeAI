"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronUp, Terminal as TerminalIcon } from "lucide-react"
import type { Terminal as XTerm } from "@xterm/xterm"
import type { FitAddon } from "@xterm/addon-fit"
import type { SandboxEvent, TerminalCommandInput } from "@forgeAI/shared"

import "@xterm/xterm/css/xterm.css"

import { useCollaborators } from "@/hooks/use-collaborators"
import { useProjectSocket } from "@/hooks/use-project-socket"
import { useSession } from "@/hooks/use-session"
import { canContribute, useWorkspaceRole } from "@/hooks/use-workspace-role"
import { useOpenProject } from "@/lib/project-store"

type Status = "connecting" | "live" | "exited" | "error"

const STATUS_LABEL: Record<Status, string> = {
  connecting: "○ connecting",
  live: "● live",
  exited: "○ exited",
  error: "○ error",
}

/** Shown when the socket is down, since a PTY has no local echo and typing would look dead. */
const OFFLINE_HINT = "no connection to the sandbox service"

/** Accent colors; the rest of the palette is read from theme CSS variables at mount. */
const GREEN = "#c3e88d"
const RED = "#ff6b6b"
const BLUE = "#82aaff"

// Reads a CSS custom property from an element, with a fallback.
// Used to theme xterm from the app's CSS variables.
function cssVar(el: HTMLElement, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback
}

// Creates an xterm instance with a fit addon, themed from the host's CSS variables.
// xterm touches `window` at import time, so it is loaded lazily in the browser.
async function createXterm(
  host: HTMLElement,
): Promise<{ term: XTerm; fit: FitAddon }> {
  const [{ Terminal: XTermCtor }, { FitAddon: FitAddonCtor }] =
    await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")])

  const term = new XTermCtor({
    convertEol: true,
    cursorBlink: true,
    fontFamily: cssVar(
      host,
      "--font-mono",
      "ui-monospace, SFMono-Regular, Menlo, monospace",
    ),
    fontSize: 12,
    lineHeight: 1.35,
    theme: {
      background: cssVar(host, "--surface-dark", "#201d1d"),
      foreground: cssVar(host, "--on-dark-surface", "#fdfcfc"),
      cursor: cssVar(host, "--on-dark-surface", "#fdfcfc"),
      green: GREEN,
      red: RED,
      blue: BLUE,
    },
  })

  const fit = new FitAddonCtor()
  term.loadAddon(fit)
  return { term, fit }
}

// The terminal's header strip: collapse toggle, status, who is typing, and take over/restart/clear.
// "take over" appears for writers who aren't currently driving.
function TerminalHeader({
  open,
  onToggle,
  projectName,
  status,
  connected,
  mayType,
  driving,
  driverName,
  message,
  onTakeover,
  onRestart,
  onClear,
}: {
  open: boolean
  onToggle: () => void
  projectName: string
  status: Status
  connected: boolean
  mayType: boolean
  driving: boolean
  driverName: string | null
  message: string | null
  onTakeover: () => void
  onRestart: () => void
  onClear: () => void
}) {
  return (
    <div className="text-ash-dark-surface border-hairline-strong/30 flex items-center gap-2 border-b px-3 py-1 text-[11px]">
      <button
        onClick={onToggle}
        className="hover:text-on-dark-surface flex items-center gap-1"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronUp className="h-3 w-3" />
        )}
        <TerminalIcon className="h-3 w-3" /> Terminal
      </button>
      <span className="text-ash-dark-surface/60">·</span>
      <span>bash · {projectName}</span>
      <span className="text-ash-dark-surface/60">·</span>
      <span
        className={
          status === "live"
            ? "text-[#c3e88d]"
            : status === "error"
              ? "text-[#ff6b6b]"
              : "text-ash-dark-surface/60"
        }
      >
        {STATUS_LABEL[status]}
      </span>
      {!connected && (
        <span className="text-ash-dark-surface/60 truncate">
          · {OFFLINE_HINT}
        </span>
      )}
      {connected && status === "live" && !mayType && (
        <span className="text-ash-dark-surface/60 truncate">· view only</span>
      )}
      {connected && status === "live" && mayType && driverName && (
        <span className="text-ash-dark-surface/60 truncate">
          · {driverName} is typing
        </span>
      )}
      {message && <span className="truncate text-[#ff6b6b]">{message}</span>}
      <div className="ml-auto flex items-center gap-1">
        {status === "live" && mayType && !driving && (
          <button
            onClick={onTakeover}
            className="px-1.5 text-[#82aaff] hover:brightness-110"
          >
            take over
          </button>
        )}
        {(status === "exited" || status === "error") && connected && (
          <button
            onClick={onRestart}
            className="px-1.5 text-[#c3e88d] hover:brightness-110"
          >
            restart
          </button>
        )}
        <button onClick={onClear} className="hover:text-on-dark-surface px-1.5">
          clear
        </button>
      </div>
    </div>
  )
}

// The project's shared shell (xterm over the socket): one person types, everyone watches.
// Viewers can only watch; writers can take over the keyboard.
export function Terminal() {
  const project = useOpenProject()
  const projectId = project.id
  const socket = useProjectSocket()

  const { session } = useSession()
  const myUserId = session?.user?.id
  const { collaborators } = useCollaborators()
  // Viewers never type (the server refuses them anyway).
  const mayType = canContribute(useWorkspaceRole(project.workspaceId))

  const [open, setOpen] = useState(true)
  const [status, setStatus] = useState<Status>("connecting")
  const [message, setMessage] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [driverId, setDriverId] = useState<string | null>(null)

  const driving = !!myUserId && driverId === myUserId
  const driverName =
    driverId && driverId !== myUserId
      ? (collaborators.find((c) => c.user.id === driverId)?.user.name ??
        "Someone else")
      : null

  const hostRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)
  // Read inside xterm's data handler, which is registered once.
  const drivingRef = useRef(false)
  // State (not a ref) so the socket effect re-runs once the lazy xterm exists.
  const [term, setTerm] = useState<XTerm | null>(null)

  // Create the terminal once and keep it; collapsing only hides it, preserving scrollback.
  useEffect(() => {
    if (!hostRef.current) return
    const host = hostRef.current
    let disposed = false
    let created: XTerm | null = null

    void (async () => {
      const { term, fit } = await createXterm(host)
      if (disposed) return

      term.open(host)
      fit.fit()

      fitRef.current = fit
      created = term
      setTerm(term)
    })()

    return () => {
      disposed = true
      fitRef.current = null
      // Disposed here, not in a state updater (updaters may run twice).
      created?.dispose()
      setTerm(null)
    }
  }, [])

  // Sends a terminal command over the project socket.
  const send = useCallback(
    (command: TerminalCommandInput) => {
      socket?.emit("terminal:command", command)
    },
    [socket],
  )

  useEffect(() => {
    if (!socket || !term) return

    // Applies terminal events: ready, driver changes, output, exit and errors.
    const onEvent = (event: SandboxEvent) => {
      if (event.projectId !== projectId) return

      switch (event.type) {
        case "terminal.ready":
          setStatus("live")
          setMessage(null)
          break
        case "terminal.driver":
          setDriverId(event.userId)
          break
        case "terminal.output":
          // Base64 bytes, since a chunk can end mid-character; xterm reassembles them.
          term.write(Uint8Array.from(atob(event.data), (c) => c.charCodeAt(0)))
          break
        case "terminal.history":
          // The shell's recent output, sent because this tab just joined; it replaces what's on screen.
          if (event.connectionId !== socket.id) break
          term.reset()
          term.write(Uint8Array.from(atob(event.data), (c) => c.charCodeAt(0)))
          break
        case "terminal.exit":
          setStatus("exited")
          term.write("\r\n\x1b[90m[ shell exited ]\x1b[0m\r\n")
          break
        case "terminal.error":
          setStatus("error")
          setMessage(event.message)
          break
      }
    }

    // Open the shell on (re)connect rather than mount, so the open is never lost in a buffer.
    const onConnect = () => {
      setConnected(true)
      const { cols, rows } = term
      send({ type: "terminal.open", cols, rows })
    }
    const onDisconnect = () => {
      setConnected(false)
      setStatus("connecting")
    }

    socket.on("sandbox:event", onEvent)
    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    if (socket.connected) onConnect()

    // Gated here rather than via xterm's read-only mode, which would also block copy and scroll.
    const typed = term.onData((data) => {
      if (!drivingRef.current) return
      send({ type: "terminal.input", data })
    })

    return () => {
      socket.off("sandbox:event", onEvent)
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      typed.dispose()
    }
    // `status` is deliberately absent: re-running this would re-open the shell.
  }, [socket, term, projectId, send])

  useEffect(() => {
    drivingRef.current = driving && mayType
  }, [driving, mayType])

  // Starts a fresh shell after the previous one exited or errored.
  const restart = useCallback(() => {
    if (!term) return
    term.write("\r\n\x1b[90m[ starting a new shell… ]\x1b[0m\r\n")
    setStatus("connecting")
    setMessage(null)
    send({ type: "terminal.open", cols: term.cols, rows: term.rows })
  }, [term, send])

  // Keep the PTY sized to the box (only the driver resizes it).
  useEffect(() => {
    if (!open || !hostRef.current) return
    const host = hostRef.current

    const observer = new ResizeObserver(() => {
      // Skip while hidden: fitting to zero would collapse the PTY to 1x1.
      if (!term || host.clientHeight === 0) return
      fitRef.current?.fit()
      if (drivingRef.current)
        send({ type: "terminal.resize", cols: term.cols, rows: term.rows })
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [open, term, send])

  return (
    <div className="border-hairline-strong/30 bg-surface-dark text-on-dark-surface shrink-0 border-t">
      <TerminalHeader
        open={open}
        onToggle={() => setOpen((o) => !o)}
        projectName={project.name}
        status={status}
        connected={connected}
        mayType={mayType}
        driving={driving}
        driverName={driverName}
        message={message}
        onTakeover={() => send({ type: "terminal.takeover" })}
        onRestart={restart}
        onClear={() => term?.clear()}
      />
      {/* Hidden, never unmounted, so the scrollback survives collapsing. */}
      <div ref={hostRef} className={`h-40 px-2 py-1 ${open ? "" : "hidden"}`} />
    </div>
  )
}
