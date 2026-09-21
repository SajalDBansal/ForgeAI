import type { AgentEvent, AgentSnapshot } from "./agent.js"
import type { ProjectEvent } from "./build.js"
import type { SandboxEvent } from "./terminal.js"
import type { TerminalCommandInput } from "../validations/terminal.js"

export const WS_PROJECT_TICKET_SCOPE = "ws-project"

export interface ServerToClientEvents {
  /** Durable, Postgres-backed events: chat, secrets, commits, info. */
  "project:event": (payload: ProjectEvent) => void
  /** Live sandbox traffic: terminal output and lifecycle. Never stored. */
  "sandbox:event": (payload: SandboxEvent) => void
  /** Live agent activity: reply text as it's written, tool calls, run status. Never stored. */
  "agent:event": (payload: AgentEvent) => void
  /** The current live agent state for a tab joining halfway through a run. */
  "agent:snapshot": (payload: AgentSnapshot) => void
  /** This connection's own permission, sent once on connect; a change means access changed. */
  access: (payload: { canWrite: boolean }) => void
}

export interface ClientToServerEvents {
  /** Refresh live state when the Agent tab mounts on an already connected socket. */
  "agent:sync": () => void
  /** Drive the project's shell. ws-server adds the project id from the ticket. */
  "terminal:command": (payload: TerminalCommandInput) => void
}

export interface SocketData {
  projectId: string
  userId: string
  /** False for a VIEWER. Comes from the signed ticket, so the client can't claim it. */
  canWrite: boolean
}

/** Claims carried in a project ticket's `extra` field (base64url, so it has no dots). */
export interface ProjectTicketClaims {
  projectId: string
  canWrite: boolean
  accessVersion: string
}

// Serializes ticket claims into the base64url `extra` string.
// Used by api-server when minting a project WebSocket ticket.
export function encodeProjectTicketClaims(claims: ProjectTicketClaims): string {
  return Buffer.from(JSON.stringify(claims), "utf8").toString("base64url")
}

// Parses the `extra` string of a verified ticket back into claims.
// Used by ws-server on connect; returns null for anything malformed.
export function decodeProjectTicketClaims(
  extra: string,
): ProjectTicketClaims | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(extra, "base64url").toString("utf8"),
    ) as ProjectTicketClaims
    if (
      typeof parsed?.projectId !== "string" ||
      typeof parsed?.canWrite !== "boolean" ||
      typeof parsed?.accessVersion !== "string"
    )
      return null
    return parsed
  } catch {
    return null
  }
}
