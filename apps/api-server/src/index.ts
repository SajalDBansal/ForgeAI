import "dotenv/config"

import { prisma } from "@forgeAI/database"
import { beginShutdown, describeSandboxPlan } from "@forgeAI/shared"

import { createServer } from "./server.js"
import { ENV_CONFIG } from "./lib/envConfig.js"

const port = ENV_CONFIG.PORT ? Number(ENV_CONFIG.PORT) : 3002

const app = await createServer()

app.log.info(`[sandbox-plan] ${describeSandboxPlan(ENV_CONFIG.SANDBOX_PLAN)}`)

try {
  await app.listen({ port, host: "0.0.0.0" })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}

let shuttingDown = false

// SIGTERM: fail /readyz, keep serving while the load balancer notices, then finish in-flight
// requests and close. Without it every deploy cut requests off mid-flight. A second signal exits at once.
function shutDown(signal: NodeJS.Signals): void {
  if (shuttingDown) process.exit(1)
  shuttingDown = true
  beginShutdown()
  app.log.info(`received ${signal}; finishing requests, then exiting`)

  void (async () => {
    await new Promise((resolve) =>
      setTimeout(resolve, ENV_CONFIG.SHUTDOWN_DRAIN_SECONDS * 1_000),
    )
    // Stops listening and waits for requests in flight; the onClose hook closes Redis.
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  })()
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => shutDown(signal))
}
