import z from "zod"

import { resolveProjectPath } from "../types/files.js"
import { PRESENCE_ACTIVITY_KINDS } from "../types/presence.js"

/**
 * Longest shared-editor update a tab may send (base64): a big paste or a long file's initial state.
 * ws-server's per-message limit is set just above it, or Socket.IO would drop the tab first.
 */
export const DOC_UPDATE_MAX_CHARS = 2_000_000

/** Terminal columns/rows; capped because the PTY allocates for whatever is asked. */
const dimension = z.number().int().min(1).max(1000)

/** A file being edited, checked with the same rule as the REST file endpoints. */
const docPath = z
  .string()
  .trim()
  .min(1, "File path is required")
  .refine(
    (path) => resolveProjectPath(path) !== undefined,
    "That path is outside the project",
  )

/** Shared with the dev-command HTTP endpoint so a saved command is always runnable. */
export const devCommand = z
  .string()
  .trim()
  .min(1, "Enter a command to run")
  .max(2000)
export const devPort = z
  .number()
  .int()
  .min(1, "Enter a port")
  .max(65535, "Ports stop at 65535")

/** Socket commands, validated in ws-server before reaching Redis. `projectId` comes from the ticket. */
export const terminalCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("terminal.open"),
    cols: dimension,
    rows: dimension,
  }),
  // Capped so one socket can't push an unbounded payload through Redis.
  z.object({ type: z.literal("terminal.input"), data: z.string().max(64_000) }),
  z.object({
    type: z.literal("terminal.resize"),
    cols: dimension,
    rows: dimension,
  }),
  z.object({ type: z.literal("terminal.close") }),
  z.object({ type: z.literal("terminal.takeover") }),
  z.object({
    type: z.literal("dev.start"),
    command: devCommand,
    port: devPort,
    // Only used to phrase a "missing module" error; the orchestrator has no database.
    installCommand: devCommand.optional(),
  }),
  z.object({ type: z.literal("dev.stop") }),
  z.object({
    type: z.literal("doc.open"),
    path: docPath,
    // Only on reconnect: what the tab already has.
    epoch: z.string().min(1).max(100).optional(),
    stateVector: z.string().min(1).max(100_000).optional(),
  }),
  z.object({
    type: z.literal("doc.update"),
    path: docPath,
    update: z.string().min(1).max(DOC_UPDATE_MAX_CHARS),
    epoch: z.string().min(1).max(100),
  }),
  z.object({ type: z.literal("doc.close"), path: docPath }),
  z.object({ type: z.literal("doc.save"), path: docPath }),
  z.object({
    type: z.literal("doc.resolve"),
    path: docPath,
    keep: z.enum(["mine", "disk"]),
  }),
  z.object({
    type: z.literal("presence.ping"),
    paths: z.array(docPath).max(50),
    activity: z
      .object({
        kind: z.enum(PRESENCE_ACTIVITY_KINDS),
        path: docPath.optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("snapshot.resolve"),
    keep: z.enum(["new", "old"]),
  }),
])

/** Commands a VIEWER may send. An allow-list, so any new command is restricted by default. */
const WATCH_ONLY_COMMANDS = new Set<TerminalCommandInput["type"]>([
  "terminal.open",
  "doc.open",
  "doc.close",
  "presence.ping",
])

// Checks whether a socket command changes something (and so needs write access).
// Used by ws-server to refuse VIEWER sockets before the command reaches Redis.
export function isWriteCommand(type: TerminalCommandInput["type"]): boolean {
  return !WATCH_ONLY_COMMANDS.has(type)
}

export type TerminalCommandInput = z.infer<typeof terminalCommandSchema>
