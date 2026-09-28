import type { FastifyInstance } from "fastify"

import {
  healthzHandler,
  readyzHandler,
} from "../controller/health.controller.js"

// Registers the probes at the root (/healthz, /readyz), where Kubernetes expects them.
export async function healthRouter(app: FastifyInstance): Promise<void> {
  app.get("/healthz", healthzHandler)
  app.get("/readyz", readyzHandler)
}
