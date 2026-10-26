import type { FastifyInstance } from "fastify"

import { secretRedactionsForAgentHandler } from "../controller/build.controller.js"
import { openSandboxForAgentHandler } from "../controller/sandbox.controller.js"
import { requireInternalToken } from "../lib/internal-auth.js"

// Routes only ForgeAI's own services call, never a browser: every one needs INTERNAL_API_TOKEN.
export async function internalRouter(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", requireInternalToken)

  // The agent worker opens a run's sandbox through the same rules as a tab does (I5b, option A).
  app.post("/agent/projects/:id/sandbox", openSandboxForAgentHandler)
  app.post(
    "/agent/projects/:id/secret-redactions",
    secretRedactionsForAgentHandler,
  )
}
