import "dotenv/config"

import { beginShutdown, describeSandboxPlan } from "@forgeAI/shared"

import type { TerminalCommand } from "@forgeAI/shared"

import { createServer } from "./server.js"
import { ENV_CONFIG } from "./envConfig.js"
import { closePresence } from "./lib/presence.js"
import {
  closeRedis,
  stopTerminalCommands,
  subscribeToTerminalCommands,
} from "./lib/redis.js"
import { handleDevCommand } from "./service/dev.service.js"
import { handleDocumentCommand } from "./service/document.service.js"
import {
  adoptRunningPods,
  drainForShutdown,
} from "./service/lifecycle.service.js"
import { handlePresencePing } from "./service/presence.service.js"
import { startReaper } from "./service/reaper.service.js"
import { startSpendCounter } from "./service/spend.service.js"
import { startHealthMonitor } from "./service/health-state.service.js"
import { handleSnapshotCommand } from "./service/snapshot.service.js"
import { handleTerminalCommand } from "./service/terminal.service.js"

const port = ENV_CONFIG.PORT ? Number(ENV_CONFIG.PORT) : 3004

const orchestrator = await createServer()

// Re-adopt the previous process's sandboxes before accepting any commands for them.
console.log(`[sandbox-plan] ${describeSandboxPlan(ENV_CONFIG.SANDBOX_PLAN)}`)
console.log(
  `[orchestrator] id=${ENV_CONFIG.ORCHESTRATOR_ID} target=${ENV_CONFIG.ORCHESTRATOR_TARGET_SANDBOXES} max=${ENV_CONFIG.ORCHESTRATOR_MAX_SANDBOXES}`,
)

await adoptRunningPods()

// Narrows a command to the `doc.*` family via its template-literal type.
// A new doc command is routed automatically and must be handled to compile.
function isDocumentCommand(
  command: TerminalCommand,
): command is Extract<TerminalCommand, { type: `doc.${string}` }> {
  return command.type.startsWith("doc.")
}

// Sends a browser command to the service that owns it.
// Every command arrives over the one Redis channel this process subscribes to.
function routeSandboxCommand(command: TerminalCommand): void {
  // Presence only touches memory, so it is handled synchronously.
  if (command.type === "presence.ping") {
    handlePresencePing(command)
    return
  }

  const work =
    command.type === "dev.start" || command.type === "dev.stop"
      ? handleDevCommand(command)
      : command.type === "snapshot.resolve"
        ? handleSnapshotCommand(command)
        : isDocumentCommand(command)
          ? handleDocumentCommand(command)
          : handleTerminalCommand(command)

  void work.catch((error) => {
    orchestrator.log.error(
      { err: error, command: command.type },
      "sandbox command failed",
    )
  })
}

subscribeToTerminalCommands(routeSandboxCommand)

// Shuts down idle sandboxes once their work is safe in R2.
startReaper()

// Counts sandbox time every minute, for the daily budget (E12).
await startSpendCounter()

// Watches event-loop lag and heap; sustained overload pauses new projects (E17).
startHealthMonitor()

try {
  await orchestrator.listen({ port, host: "0.0.0.0" })
} catch (error) {
  orchestrator.log.error(error)
  process.exit(1)
}

let shuttingDown = false

// Stops taking commands and requests, saves open work, then exits.
// A second signal exits immediately; the next process adopts and saves the rest.
function handleShutdownSignal(signal: NodeJS.Signals): void {
  if (shuttingDown) process.exit(1)
  shuttingDown = true
  // First, so /readyz says no before anything stops; then commands stop, work is saved, and it exits.
  beginShutdown()
  orchestrator.log.info(`received ${signal}; saving work before exiting`)

  void (async () => {
    await stopTerminalCommands()
    // Not awaited: `close` waits for in-flight requests; the drain has its own deadline.
    void orchestrator.close()
    await drainForShutdown(ENV_CONFIG.SHUTDOWN_SAVE_SECONDS * 1_000)
    await Promise.allSettled([closeRedis(), closePresence()])
    process.exit(0)
  })()
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => handleShutdownSignal(signal))
}
