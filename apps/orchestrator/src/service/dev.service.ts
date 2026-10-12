import type { PodProcess } from "@forgeAI/sandbox-provider"
import {
  PROJECT_ROOT,
  SANDBOX_COMMAND_TIMEOUT_MS,
  createSecretStreamRedactor,
} from "@forgeAI/shared"
import type {
  AgentDevServerResult,
  AgentDevStartDataType,
  DevServerState,
  DevServerStatus,
  TerminalCommand,
} from "@forgeAI/shared"

import { ENV_CONFIG } from "../envConfig.js"
import { countWatchers } from "../lib/presence.js"
import { publishSandboxEvent } from "../lib/redis.js"
import { getPod, getProjectSecrets } from "../state.js"
import { touchPod } from "./activity.service.js"
import {
  projectRetiringMessage,
  withActiveProjectWork,
} from "./active-work.service.js"
import { provider } from "../lib/provider.js"
import {
  projectSecretEnvFor,
  projectSecretRedactions,
} from "./runtime-secret-policy.js"

/** Timeout for one-line sandbox questions like `ss` and `kill`. */
const QUICK = { timeoutMs: SANDBOX_COMMAND_TIMEOUT_MS.quick }

/** Lines of server output kept for the failure message. */
const OUTPUT_LINES = 40

/** How long to wait for the port to answer before reporting an error (cold builds are slow). */
const READY_TIMEOUT_MS = 25_000
const READY_POLL_MS = 1_000

interface DevServer {
  process: PodProcess
  command: string
  port: number
  previewUrl: string
  /** Who pressed Start; shown to everyone since the server belongs to the project. */
  startedBy: string
  state: DevServerState
  /** Ring buffer of recent output lines; the failure reason is usually in here. */
  output: string[]
}

/** One dev server per project (it binds a port, so it's shared, not per person). */
const servers = new Map<string, DevServer>()

/** Starts in flight, so two people pressing Start share one server. */
const starting = new Map<string, Promise<void>>()

/** How often running servers are checked for being abandoned. */
const TICK_MS = 30_000

/** How long everybody has to be gone before a dev server is stopped. */
const UNWATCHED_GRACE_MS = ENV_CONFIG.DEV_SERVER_UNWATCHED_GRACE_SECONDS * 1_000

/** When each project was first seen with nobody watching (a refresh empties presence briefly). */
const unwatchedSince = new Map<string, number>()

// Stops a dev server once everybody has closed the project for the grace period.
// Lets the sandbox fall back to its normal idle timeout; code on disk is untouched.
async function reapIfUnwatched(projectId: string): Promise<void> {
  const watchers = await countWatchers(projectId)

  // Unknown is not "nobody": never stop a server because Redis didn't answer.
  if (watchers === undefined) return

  if (watchers > 0) {
    unwatchedSince.delete(projectId)
    return
  }

  const since = unwatchedSince.get(projectId)
  if (since === undefined) {
    unwatchedSince.set(projectId, Date.now())
    return
  }

  if (Date.now() - since < UNWATCHED_GRACE_MS) return

  unwatchedSince.delete(projectId)
  console.log(
    `[dev] stopping the dev server for ${projectId}: nobody has had it open for ${UNWATCHED_GRACE_MS / 1000}s`,
  )
  await stop(projectId)
}

setInterval(() => {
  for (const projectId of servers.keys()) void reapIfUnwatched(projectId)
}, TICK_MS).unref()

// Publishes the dev server's state to every tab on the project.
// Used for every transition: starting, live, error, crashed, stopped.
function publishStatus(
  projectId: string,
  state: DevServerState,
  extra: { previewUrl?: string; message?: string; startedBy?: string } = {},
): void {
  publishSandboxEvent({ type: "dev.status", projectId, state, ...extra })
}

/** Lines that appear in every crash but never explain one: stack frames and version footers. */
const STACK_NOISE = [/^\s*at\s/, /^\s*Node\.js v/, /^\s*File "/, /^\s*\^+\s*$/]

// Picks the last few meaningful output lines as a failure message.
// Skips stack frames so the actual `Error: ...` line shows; falls back to the raw tail.
function tail(output: string[]): string | undefined {
  const meaningful = output.filter(
    (line) => !STACK_NOISE.some((pattern) => pattern.test(line)),
  )
  const lines = meaningful.length ? meaningful : output
  const text = lines.slice(-6).join("\n").trim()
  return text || undefined
}

function logText(output: string[]): string {
  return output.slice(-OUTPUT_LINES).join("\n")
}

/** The ways runtimes say "that isn't installed"; capture group 1 is the missing name. */
const MISSING_DEPENDENCY_PATTERNS: RegExp[] = [
  /Cannot find module ['"]([^'"]+)['"]/i,
  /Cannot find package ['"]([^'"]+)['"]/i,
  /ERR_MODULE_NOT_FOUND[^\n]*['"]([^'"]+)['"]/i,
  /ModuleNotFoundError: No module named ['"]?([^'"\s]+)/i,
  /ImportError: No module named ['"]?([^'"\s]+)/i,
  /no required module provides package ([^\s;]+)/i,
  // `sh: 1: next: not found`: node_modules is missing entirely.
  /(?:sh|bash):[^\n]*?([\w@/.-]+): (?:command )?not found/i,
  /([\w@/.-]+): command not found/i,
]

// Returns "X is not installed, run <install>" when the failure is a missing dependency.
// Common after a restore; we advise instead of auto-installing so people know what drifted.
function missingDependencyAdvice(
  output: string[],
  installCommand: string | undefined,
): string | undefined {
  const text = output.join("\n")

  for (const pattern of MISSING_DEPENDENCY_PATTERNS) {
    const match = text.match(pattern)
    if (!match) continue

    const name = match[1]
    const what = name
      ? `\`${name}\` is not installed`
      : "A dependency is missing"
    // Without a declared install command, don't assume npm.
    const how = installCommand
      ? `Run \`${installCommand}\` in the terminal, then start it again.`
      : "Install it in the terminal, then start the dev server again."
    return `${what}. ${how}`
  }

  return undefined
}

// Checks whether something is actually serving the preview URL.
// 502/504 are E2B's proxy saying nothing is on the port; any other status counts as up.
async function answers(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(READY_POLL_MS * 4),
    })
    return res.status !== 502 && res.status !== 504
  } catch {
    return false
  }
}

/** Ports the sandbox itself always has open. */
const SANDBOX_OWN_PORTS = new Set(["22", "111"])

// Extracts ports a user process is listening on from `ss -tln` output, excluding `port`.
// Matches concrete addresses only, which filters out E2B's own `*:` listeners.
function otherListeningPorts(sockets: string, port: number): string[] {
  const found = [
    ...sockets.matchAll(/(?:0\.0\.0\.0|127\.0\.0\.1|\[::1?\]):(\d+)\s/g),
  ]
    .map((m) => m[1]!)
    .filter((p) => !SANDBOX_OWN_PORTS.has(p) && p !== String(port))
  return [...new Set(found)]
}

// Explains why the port never answered by looking inside the sandbox.
// Names the port the server actually bound, turning a timeout into a one-line fix.
async function diagnose(projectId: string, port: number): Promise<string> {
  const generic = `Started, but nothing is listening on port ${port}. Check that the port in your command matches the one set here.`

  const pod = getPod(projectId)
  if (!pod) return generic

  try {
    const { stdout } = await provider.runPodCommand(
      pod.sandboxId,
      `ss -tln | grep ':${port} ' || true`,
      QUICK,
    )
    if (stdout.trim())
      return `The dev server is listening on port ${port} but is not answering requests yet.`

    const { stdout: sockets } = await provider.runPodCommand(
      pod.sandboxId,
      "ss -tln | tail -n +2 || true",
      QUICK,
    )
    const others = otherListeningPorts(sockets, port)

    return others.length
      ? `Started, but nothing is listening on port ${port} — something is listening on ${others.join(", ")}. Change the port here, or the one in your command, so they match.`
      : generic
  } catch {
    return generic
  }
}

// Polls the preview URL until it answers, then marks the server live (or reports why not).
// Runs unawaited so pressing Start never waits for a build.
async function waitUntilLive(
  projectId: string,
  server: DevServer,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS

  while (Date.now() < deadline) {
    // The server was stopped or exited meanwhile.
    if (servers.get(projectId) !== server) return

    if (await answers(server.previewUrl)) {
      server.state = "live"
      publishStatus(projectId, "live", {
        previewUrl: server.previewUrl,
        startedBy: server.startedBy,
      })
      return
    }

    await new Promise((r) => setTimeout(r, READY_POLL_MS))
  }

  if (servers.get(projectId) !== server) return

  server.state = "error"
  publishStatus(projectId, "error", {
    message: await diagnose(projectId, server.port),
    startedBy: server.startedBy,
  })
}

// Returns a callback that keeps the last output lines and streams each chunk to tabs.
// The Preview tab shows this build log while the server is starting.
function outputRecorder(
  projectId: string,
  output: string[],
): (chunk: string) => void {
  return (chunk) => {
    for (const line of chunk.split("\n")) {
      if (line.trim()) output.push(line)
    }
    if (output.length > OUTPUT_LINES)
      output.splice(0, output.length - OUTPUT_LINES)
    publishSandboxEvent({ type: "dev.log", projectId, data: chunk })
  }
}

// Reports a dev server that ended on its own: `crashed` if it was live, else `error`.
// Prefers missing-dependency advice, then the output tail, then the exit code.
function reportExit(
  projectId: string,
  server: DevServer,
  exitCode: number | undefined,
  installCommand: string | undefined,
): void {
  servers.delete(projectId)

  const state: DevServerState = server.state === "live" ? "crashed" : "error"
  const advice = missingDependencyAdvice(server.output, installCommand)
  publishStatus(projectId, state, {
    message:
      advice ??
      tail(server.output) ??
      `The dev server exited (code ${exitCode ?? "unknown"}).`,
    startedBy: server.startedBy,
  })
}

// Frees the port, launches the dev command detached, and starts waiting for it to go live.
// Status is published before slow work so every tab shows "starting" straight away.
async function start(
  projectId: string,
  command: string,
  port: number,
  startedBy: string,
  installCommand: string | undefined,
): Promise<void> {
  const pod = getPod(projectId)
  if (!pod) {
    publishStatus(projectId, "error", {
      message: "This project has no sandbox running yet.",
    })
    return
  }

  // Clear anything on the port first, or the new server silently binds the next one up.
  await freePort(projectId, port)

  publishStatus(projectId, "starting", { startedBy })

  // Declared first so the exit callback can see it; a fast failure may fire before assignment.
  let server: DevServer | undefined
  const output: string[] = []

  try {
    const previewUrl = await provider.podPreviewUrl(pod.sandboxId, port)
    const secrets = getProjectSecrets(projectId)
    const envs = projectSecretEnvFor("dev-server", secrets)
    const redactor = createSecretStreamRedactor(
      projectSecretRedactions(secrets),
    )
    const recordOutput = outputRecorder(projectId, output)
    const recordRedactedOutput = (chunk: string) => {
      const safe = redactor.push(chunk)
      if (safe) recordOutput(safe)
    }

    const process = await provider.startPodProcess(pod.sandboxId, {
      command,
      cwd: PROJECT_ROOT,
      // Runtime project secrets are process env only: never written to the sandbox filesystem.
      ...(envs && { envs }),
      onOutput: recordRedactedOutput,
      onExit: (exitCode) => {
        const tail = redactor.flush()
        if (tail) recordOutput(tail)
        // A deliberate stop already cleared the map, so this only fires for real exits.
        if (!server || servers.get(projectId) !== server) return
        reportExit(projectId, server, exitCode, installCommand)
      },
    })

    server = {
      process,
      command,
      port,
      previewUrl,
      startedBy,
      state: "starting",
      output,
    }
    servers.set(projectId, server)

    void waitUntilLive(projectId, server)
  } catch (error) {
    publishStatus(projectId, "error", {
      message:
        error instanceof Error
          ? error.message
          : "Couldn't start the dev server.",
    })
  }
}

// Checks whether an existing server is worth joining: starting/live and really alive.
// A failed or silently dead server must be replaced, not joined.
async function reusable(server: DevServer): Promise<boolean> {
  if (server.state !== "live" && server.state !== "starting") return false
  return server.process.isAlive()
}

// Removes a server that is in the way, without announcing `stopped`.
// The start that follows reports what is happening.
async function discard(projectId: string, server: DevServer): Promise<void> {
  servers.delete(projectId)
  unwatchedSince.delete(projectId)
  await server.process.kill().catch(() => undefined)
  await freePort(projectId, server.port)
}

// Starts the project's dev server, joins one already running, or replaces a dead one.
// Pressing Start twice is a no-op that re-publishes the current status.
async function open(
  projectId: string,
  command: string,
  port: number,
  startedBy: string,
  installCommand: string | undefined,
): Promise<void> {
  const existing = servers.get(projectId)
  if (existing) {
    if (await reusable(existing)) {
      publishStatus(projectId, existing.state, {
        startedBy: existing.startedBy,
        ...(existing.state === "live" && { previewUrl: existing.previewUrl }),
      })
      return
    }

    await discard(projectId, existing)
  }

  const inFlight = starting.get(projectId)
  if (inFlight) {
    await inFlight
    return
  }

  const work = start(projectId, command, port, startedBy, installCommand)
  starting.set(projectId, work)
  try {
    await work
  } finally {
    starting.delete(projectId)
  }
}

// Kills whatever is still listening on the port.
// Backstop for processes that escaped the process-group kill.
async function freePort(projectId: string, port: number): Promise<void> {
  const pod = getPod(projectId)
  if (!pod) return

  try {
    await provider.runPodCommand(
      pod.sandboxId,
      `ss -tlnp | grep ':${port} ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u | xargs -r kill -9 ; true`,
      QUICK,
    )
  } catch (error) {
    console.error(`[dev] could not free port ${port} for ${projectId}:`, error)
  }
}

// Stops the project's dev server and frees its port.
// Waits for any in-flight start first so nothing is left running untracked.
async function stop(projectId: string): Promise<void> {
  unwatchedSince.delete(projectId)

  const inFlight = starting.get(projectId)
  if (inFlight) await inFlight.catch(() => undefined)

  const server = servers.get(projectId)
  if (!server) {
    publishStatus(projectId, "stopped")
    return
  }

  // Removed before the kill so the exit handler knows this was deliberate.
  servers.delete(projectId)
  await server.process.kill().catch(() => undefined)
  await freePort(projectId, server.port)
  publishStatus(projectId, "stopped")
}

// Handles dev.start and dev.stop commands from the browser.
// Both count as activity on the project.
export async function handleDevCommand(
  command: Extract<TerminalCommand, { type: "dev.start" | "dev.stop" }>,
): Promise<void> {
  try {
    return await withActiveProjectWork(
      command.projectId,
      "dev",
      command.type,
      async () => {
        touchPod(command.projectId)

        switch (command.type) {
          case "dev.start":
            return open(
              command.projectId,
              command.command,
              command.port,
              command.userId,
              command.installCommand,
            )
          case "dev.stop":
            return stop(command.projectId)
        }
      },
    )
  } catch (error) {
    publishStatus(command.projectId, "error", {
      message:
        projectRetiringMessage(error) ??
        (error instanceof Error
          ? error.message
          : "Couldn't change the dev server."),
    })
  }
}

// Checks whether the project has a dev server starting or live.
// The reaper treats a live preview as the project being in use.
export function isDevServerRunning(projectId: string): boolean {
  const state = servers.get(projectId)?.state
  return state === "live" || state === "starting"
}

// Returns the dev server's current status for the ensure response.
// A freshly opened tab missed earlier events and would otherwise show "stopped".
export function getDevServerStatus(projectId: string): DevServerStatus {
  const server = servers.get(projectId)
  if (!server) return { state: "stopped" }
  return {
    state: server.state,
    startedBy: server.startedBy,
    ...(server.state === "live" && { previewUrl: server.previewUrl }),
  }
}

function agentDevResult(
  projectId: string,
  message?: string,
): AgentDevServerResult {
  const server = servers.get(projectId)
  if (!server)
    return { state: "stopped", ...(message && { message }), logs: "" }
  return {
    state: server.state,
    ...(server.state === "live" && { previewUrl: server.previewUrl }),
    ...(message && { message }),
    logs: logText(server.output),
  }
}

export async function startDevServerForAgent(
  projectId: string,
  input: AgentDevStartDataType,
): Promise<
  { ok: true; data: AgentDevServerResult } | { ok: false; reason: "no_pod" }
> {
  if (!getPod(projectId)) return { ok: false, reason: "no_pod" }
  try {
    await withActiveProjectWork(projectId, "agent", "agent dev start", () =>
      open(projectId, input.command, input.port, "agent", input.installCommand),
    )
    return { ok: true, data: agentDevResult(projectId) }
  } catch (error) {
    return {
      ok: true,
      data: agentDevResult(
        projectId,
        projectRetiringMessage(error) ??
          (error instanceof Error ? error.message : String(error)),
      ),
    }
  }
}

export async function stopDevServerForAgent(
  projectId: string,
): Promise<
  { ok: true; data: AgentDevServerResult } | { ok: false; reason: "no_pod" }
> {
  if (!getPod(projectId)) return { ok: false, reason: "no_pod" }
  try {
    await withActiveProjectWork(projectId, "agent", "agent dev stop", () =>
      stop(projectId),
    )
    return { ok: true, data: agentDevResult(projectId) }
  } catch (error) {
    return {
      ok: true,
      data: agentDevResult(
        projectId,
        projectRetiringMessage(error) ??
          (error instanceof Error ? error.message : String(error)),
      ),
    }
  }
}

export function readDevServerForAgent(
  projectId: string,
): { ok: true; data: AgentDevServerResult } | { ok: false; reason: "no_pod" } {
  if (!getPod(projectId)) return { ok: false, reason: "no_pod" }
  return { ok: true, data: agentDevResult(projectId) }
}

// Stops and forgets the project's dev server.
// Called when its pod goes away.
export async function closeProjectDevServer(projectId: string): Promise<void> {
  const server = servers.get(projectId)
  if (!server) return

  servers.delete(projectId)
  unwatchedSince.delete(projectId)
  await server.process.kill().catch(() => undefined)
  await freePort(projectId, server.port)
  publishStatus(projectId, "stopped")
}
