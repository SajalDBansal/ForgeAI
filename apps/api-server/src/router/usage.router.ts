import type { FastifyInstance } from "fastify"

import { usageSummaryHandler } from "../controller/usage.controller.js"

export async function usageRouter(app: FastifyInstance): Promise<void> {
  app.get("/", usageSummaryHandler)
}
