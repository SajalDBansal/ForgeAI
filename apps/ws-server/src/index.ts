import "dotenv/config"

import { ENV_CONFIG } from "./envConfig.js"
import { startServer, stopServer } from "./server.js"
import { closeRedis } from "./redis.js"

startServer()

let shuttingDown = false

// Shut down cleanly on deploys and Ctrl+C: drain the sockets, then close Redis.
// A second signal exits at once.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (shuttingDown) process.exit(1)
    shuttingDown = true
    console.log(
      `[ws-server] received ${signal}, disconnecting tabs, then exiting`,
    )
    void stopServer(ENV_CONFIG.SHUTDOWN_DRAIN_SECONDS * 1_000)
      .then(() => closeRedis())
      .then(() => process.exit(0))
  })
}
