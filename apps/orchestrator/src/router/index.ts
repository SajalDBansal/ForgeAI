import type { FastifyInstance } from "fastify"
import { sandboxRouter } from "./sandbox.router.js"

// Registers every versioned route group.
// Mounted under /api/v1 by server.ts.
export async function v1Routers(app: FastifyInstance): Promise<void> {
  await app.register(sandboxRouter, { prefix: "/sandbox" })
}
