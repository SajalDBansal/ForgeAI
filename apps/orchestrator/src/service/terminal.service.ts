import type { PodTerminal } from "@forgeAI/sandbox-provider"
import { PROJECT_ROOT } from "@forgeAI/shared"
import type { TerminalCommand } from "@forgeAI/shared"

import { publishSandboxEvent } from "../lib/redis.js"
import {
  flushOutput,
  forgetOutput,
  queueOutput,
  recentOutput,
} from "./terminal-output.service.js"
import { touchPod } from "./activity.service.js"
import {
  projectRetiringMessage,
  withActiveProjectWork,
} from "./active-work.service.js"
import { markProjectDirty } from "../state.js"
import { getPod } from "../state.js"
import { provider } from "../lib/provider.js"

/** Shell lifetime: far longer than any sandbox, because a PTY's timeout can't be extended. */
const TERMINAL_TIMEOUT_MS = 24 * 60 * 60_000

/** One shared shell per project: everyone watching sees the same screen. */
const terminals = new Map<string, PodTerminal>()

/** Shell openings in flight, so two tabs share one shell instead of racing. */
const opening = new Map<string, Promise<PodTerminal | undefined>>()

/** Who holds the keyboard per project; one person types, everyone else watches. */
const drivers = new Map<string, string>()

// Sets (or clears) who holds the keyboard and tells every tab.
// Whoever opens the shell drives first; others must take over explicitly.
function setDriver(projectId: string, userId: string | null): void {
  if (userId) drivers.set(projectId, userId)
  else drivers.delete(projectId)
  publishSandboxEvent({ type: "terminal.driver", projectId, userId })
}

// Publishes a terminal error for the project's tabs.
// Used whenever opening or talking to the shell fails.
function publishTerminalError(projectId: string, message: string): void {
  publishSandboxEvent({ type: "terminal.error", projectId, message })
}

// Opens the PTY in the project's sandbox and wires its output and exit to Redis.
// Returns undefined (after publishing an error) when there's no pod or the open fails.
async function start(
  projectId: string,
  cols: number,
  rows: number,
): Promise<PodTerminal | undefined> {
  const pod = getPod(projectId)
  if (!pod) {
    publishTerminalError(projectId, "This project has no sandbox running yet.")
    return undefined
  }

  try {
    const terminal = await provider.openPodTerminal(pod.sandboxId, {
      cols,
      rows,
      cwd: PROJECT_ROOT,
      timeoutMs: TERMINAL_TIMEOUT_MS,
      onData: (chunk) => queueOutput(projectId, chunk),
      onExit: (exitCode) => {
        // The last output first, so "shell exited" never arrives before what it ends.
        flushOutput(projectId)
        forgetOutput(projectId)
        terminals.delete(projectId)
        setDriver(projectId, null)
        publishSandboxEvent({
          type: "terminal.exit",
          projectId,
          ...(exitCode !== undefined && { exitCode }),
        })
      },
    })

    terminals.set(projectId, terminal)
    publishSandboxEvent({
      type: "terminal.ready",
      projectId,
      pid: terminal.pid,
    })
    return terminal
  } catch (error) {
    publishTerminalError(
      projectId,
      error instanceof Error ? error.message : "Couldn't open a shell.",
    )
    return undefined
  }
}

// Attaches a tab to the project's shell, opening it if needed.
// A joining tab gets the recent output, the pid and the current driver; the opener becomes the driver.
async function open(
  command: Extract<TerminalCommand, { type: "terminal.open" }>,
): Promise<void> {
  const { projectId, userId, cols, rows } = command
  const existing = terminals.get(projectId)
  if (existing) {
    // Only for the joining tab (ws-server sends it to that socket alone); others already have it.
    const recent = recentOutput(projectId)
    if (command.connectionId && recent.length > 0) {
      publishSandboxEvent({
        type: "terminal.history",
        projectId,
        data: recent.toString("base64"),
        connectionId: command.connectionId,
      })
    }
    publishSandboxEvent({
      type: "terminal.ready",
      projectId,
      pid: existing.pid,
    })
    publishSandboxEvent({
      type: "terminal.driver",
      projectId,
      userId: drivers.get(projectId) ?? null,
    })
    return
  }

  const inFlight = opening.get(projectId)
  if (inFlight) {
    await inFlight
    return
  }

  const work = start(projectId, cols, rows)
  opening.set(projectId, work)
  try {
    const terminal = await work
    if (terminal) setDriver(projectId, userId)
  } finally {
    opening.delete(projectId)
  }
}

// Runs an action against the project's live shell, publishing any failure.
// Commands for a project with no shell are ignored; stray late keystrokes are normal.
async function withTerminal(
  projectId: string,
  act: (terminal: PodTerminal) => Promise<void>,
): Promise<void> {
  const terminal = terminals.get(projectId)
  if (!terminal) return

  try {
    await act(terminal)
  } catch (error) {
    publishTerminalError(
      projectId,
      error instanceof Error ? error.message : "The shell stopped responding.",
    )
  }
}

// Checks whether the command's sender currently holds the keyboard.
// Input from watchers is dropped silently.
function isDriver(command: TerminalCommand): boolean {
  return drivers.get(command.projectId) === command.userId
}

// Handles open, takeover, input, resize and close for the project's shared shell.
// Every command counts as activity, even a watcher's dropped keystroke.
export async function handleTerminalCommand(
  command: TerminalCommand,
): Promise<void> {
  touchPod(command.projectId)

  try {
    switch (command.type) {
      case "terminal.open":
        return withActiveProjectWork(
          command.projectId,
          "terminal",
          "terminal open",
          () => open(command),
        )
      case "terminal.takeover":
        // ws-server already enforced the role, so any writer may take the keyboard.
        if (terminals.has(command.projectId))
          setDriver(command.projectId, command.userId)
        return
      case "terminal.input":
        if (!isDriver(command)) return
        // Any shell input might change files; assume it did so the next snapshot runs.
        markProjectDirty(command.projectId)
        return withActiveProjectWork(
          command.projectId,
          "terminal",
          "terminal input",
          () => withTerminal(command.projectId, (t) => t.write(command.data)),
        )
      case "terminal.resize":
        // Only the driver's window sizes the PTY, so watchers don't reflow their screen.
        if (!isDriver(command)) return
        return withActiveProjectWork(
          command.projectId,
          "terminal",
          "terminal resize",
          () =>
            withTerminal(command.projectId, (t) =>
              t.resize({ cols: command.cols, rows: command.rows }),
            ),
        )
      case "terminal.close":
        if (!isDriver(command)) return
        return withTerminal(command.projectId, async (t) => {
          terminals.delete(command.projectId)
          forgetOutput(command.projectId)
          setDriver(command.projectId, null)
          await t.kill()
        })
    }
  } catch (error) {
    publishTerminalError(
      command.projectId,
      projectRetiringMessage(error) ??
        (error instanceof Error
          ? error.message
          : "The shell stopped responding."),
    )
  }
}

// Kills the project's shell and clears its driver.
// Called when a pod goes away so the shell doesn't outlive it.
export async function closeProjectTerminal(projectId: string): Promise<void> {
  const terminal = terminals.get(projectId)
  if (!terminal) return

  terminals.delete(projectId)
  forgetOutput(projectId)
  setDriver(projectId, null)
  await terminal.kill().catch(() => undefined)
}

export function isTerminalOpen(projectId: string): boolean {
  return terminals.has(projectId) || opening.has(projectId)
}
