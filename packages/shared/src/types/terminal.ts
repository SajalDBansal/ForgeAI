import type { SnapshotStatus } from "./snapshot.js"
import type { PersonPresence, PresenceActivity } from "./presence.js"

export type SandboxActor = "user" | "agent"

// Terminal wire contract, carried over two Redis channels that are never persisted:
//   browser -> ws-server -> sandbox-commands:<id> -> orchestrator -> PTY
//   PTY -> orchestrator -> sandbox-events:<id> -> ws-server -> browsers

export const SANDBOX_COMMANDS_CHANNEL_PREFIX = "sandbox-commands:"
export const SANDBOX_EVENTS_CHANNEL_PREFIX = "sandbox-events:"

// Builds the Redis channel name that carries browser commands for a project.
// ws-server publishes to it; the orchestrator is its only subscriber.
export function sandboxCommandsChannel(projectId: string): string {
  return `${SANDBOX_COMMANDS_CHANNEL_PREFIX}${projectId}`
}

// Builds the Redis channel name that carries sandbox output for a project.
// The orchestrator publishes to it; every ws-server instance fans it out to browsers.
export function sandboxEventsChannel(projectId: string): string {
  return `${SANDBOX_EVENTS_CHANNEL_PREFIX}${projectId}`
}

/** Starting size; the browser resizes as soon as the terminal is measured. */
export const DEFAULT_TERMINAL_SIZE = { cols: 80, rows: 24 } as const

/** What a browser asks the sandbox to do. `projectId` is stamped by ws-server from the ticket, never the client. */
export type TerminalCommand = {
  projectId: string
  userId: string
  /** The tab (socket) that sent it, stamped by ws-server; one person can have several tabs open. */
  connectionId?: string
} & (
  | { type: "terminal.open"; cols: number; rows: number }
  /** Raw keystrokes, exactly as xterm reports them. */
  | { type: "terminal.input"; data: string }
  | { type: "terminal.resize"; cols: number; rows: number }
  | { type: "terminal.close" }
  /** Claim the keyboard from whoever currently holds it. */
  | { type: "terminal.takeover" }
  /** Start the dev server with the command and port api-server resolved. */
  | {
      type: "dev.start"
      command: string
      port: number
      installCommand?: string
    }
  | { type: "dev.stop" }
  /** Start editing a file together; answered with `doc.sync`. */
  | {
      type: "doc.open"
      path: string
      /** On reconnect: the epoch and Yjs state vector the tab holds, so only missed changes are sent. */
      epoch?: string
      stateVector?: string
    }
  /** A base64 Yjs update made against `epoch`; refused if that document is gone. */
  | { type: "doc.update"; path: string; update: string; epoch: string }
  /** Nobody here is editing this file any more. */
  | { type: "doc.close"; path: string }
  /** Save now instead of waiting for the debounce (Ctrl+S, editor blur). */
  | { type: "doc.save"; path: string }
  /** Settle a disk conflict: overwrite the file (`mine`) or reload it (`disk`). */
  | { type: "doc.resolve"; path: string; keep: "mine" | "disk" }
  /** Heartbeat of which files this tab has open; stale entries simply expire. */
  | { type: "presence.ping"; paths: string[]; activity?: PresenceActivity }
  /** Answer to "a large part of this project was deleted — save that?". */
  | { type: "snapshot.resolve"; keep: "new" | "old" }
)

/** Why a document and its file diverged: edited outside the editor, or deleted. */
export type DocConflictReason = "changed" | "removed"

/** Random id of one shared-document incarnation; updates from different epochs are never merged. */
export type DocEpoch = string

/** Somebody with a file open, and whether they are typing in it right now. */
export type FileViewer = {
  userId: string
  editing: boolean
}

/** Who has what open, for one project. */
export type FilePresence = {
  path: string
  viewers: FileViewer[]
}

/** One filesystem change in a sandbox. `entry` is absent on removes. */
export type SandboxFileChange = {
  path: string
  type: "create" | "write" | "remove" | "rename" | "chmod"
  entry?: { isDirectory: boolean; size: number; modifiedAt: number }
}

/** What the dev server is doing. `error` = broken build, `crashed` = fell over after running. */
export type DevServerState =
  "stopped" | "starting" | "live" | "error" | "crashed"

/** What the sandbox sends back to every tab watching the project. */
export type SandboxEvent =
  | { type: "terminal.ready"; projectId: string; pid: number }
  /** Who holds the keyboard, or null when nobody does. */
  | { type: "terminal.driver"; projectId: string; userId: string | null }
  /** PTY output, base64 so multi-byte characters split across chunks survive. */
  | { type: "terminal.output"; projectId: string; data: string }
  /** Recent output (base64) for one tab that just joined; it replaces that tab's screen. */
  | {
      type: "terminal.history"
      projectId: string
      data: string
      connectionId: string
    }
  | { type: "terminal.exit"; projectId: string; exitCode?: number }
  | { type: "terminal.error"; projectId: string; message: string }
  | {
      type: "dev.status"
      projectId: string
      state: DevServerState
      /** Present on `live`; built from the actual port. */
      previewUrl?: string
      /** Why, on `error` and `crashed`: the tail of the server's output. */
      message?: string
      /** Who pressed Start. */
      startedBy?: string
    }
  /** The sandbox will be reaped for idleness at `reapAt`, or null to cancel the warning. */
  | { type: "sandbox.expiring"; projectId: string; reapAt: string | null }
  /** The sandbox was shut down; its work is safe in R2 and reopening restores it. */
  | { type: "sandbox.reaped"; projectId: string }
  /** The orchestrator restarted and re-adopted this sandbox; tabs should ensure the pod again. */
  | { type: "sandbox.reset"; projectId: string }
  /** The whole document as a Yjs update, for somebody who just opened it. */
  | {
      type: "doc.sync"
      projectId: string
      path: string
      update: string
      epoch: DocEpoch
    }
  /** A change somebody made; sent to everyone including the author (Yjs is idempotent). */
  | {
      type: "doc.update"
      projectId: string
      path: string
      update: string
      epoch: DocEpoch
      actor?: SandboxActor
    }
  /** Drop your copy and reopen: the document is gone (`null`) or was replaced. */
  | {
      type: "doc.reset"
      projectId: string
      path: string
      epoch: DocEpoch | null
    }
  /** This file could not be opened for editing. */
  | { type: "doc.error"; projectId: string; path: string; message: string }
  /** The file was written to the sandbox (only sent when bytes changed). */
  | {
      type: "doc.saved"
      projectId: string
      path: string
      at: string
      actor?: SandboxActor
    }
  /** Disk and document both changed; autosave is paused until `doc.resolve`. */
  | {
      type: "doc.conflict"
      projectId: string
      path: string
      reason: DocConflictReason
    }
  /** Full picture of who has which file open and what everyone is doing. */
  | {
      type: "file.presence"
      projectId: string
      files: FilePresence[]
      people: PersonPresence[]
    }
  /** Batched "these paths changed" (never contents). */
  | {
      type: "fs.changed"
      projectId: string
      changes: SandboxFileChange[]
      /** Noisy areas like node_modules that changed but are not listed file by file. */
      ignored?: string[]
      /** More changed than one message carries; tabs re-list their open folders instead. */
      truncated?: true
      actor?: SandboxActor
    }
  /** One line of dev-server output, as plain text. */
  | { type: "dev.log"; projectId: string; data: string }
  /** Full save status each time, so a tab that missed one catches up on the next. */
  | ({ type: "snapshot.status"; projectId: string } & SnapshotStatus)
