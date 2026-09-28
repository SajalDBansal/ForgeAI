import fp from "fastify-plugin"
import { Pool } from "undici"
import { ORCHESTRATOR_REQUEST_TIMEOUT_MS } from "@forgeAI/shared"
import { ENV_CONFIG } from "../lib/envConfig.js"

declare module "fastify" {
  interface FastifyInstance {
    orchestrator: Pool
  }
}

// Registers a pooled HTTP client for the orchestrator as `fastify.orchestrator`.
// Closed with the server so connections don't leak on shutdown.
export default fp(async (fastify) => {
  const pool = new Pool(ENV_CONFIG.ORCHESTRATOR_URL, {
    connections: ENV_CONFIG.ORCHESTRATOR_POOL_CONNECTIONS,
    pipelining: 1,
    keepAliveTimeout: 20_000,
    keepAliveMaxTimeout: 60_000,
    // Outlasts the orchestrator's own timeout, so it's the one that reports a slow restart.
    headersTimeout: ORCHESTRATOR_REQUEST_TIMEOUT_MS + 60_000,
  })

  fastify.decorate("orchestrator", pool)

  fastify.addHook("onClose", async () => {
    if (typeof pool.close === "function") {
      await pool.close()
      return
    }
    if (typeof pool.destroy === "function") pool.destroy()
  })
})
