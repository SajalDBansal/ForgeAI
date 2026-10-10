import type { FastifyInstance } from "fastify"

import { capacityHandler } from "../controller/capacity.controller.js"

// Registers the operator routes at the root, outside the versioned API (/internal/...).
export async function capacityRouter(app: FastifyInstance): Promise<void> {
  app.get("/internal/capacity", capacityHandler)
}
