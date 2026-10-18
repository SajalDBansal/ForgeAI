import { FastifyInstance } from "fastify"
import {
  getLiveCheckHandler,
  getReadyCheckHandler,
} from "../controller/health.controller.js"

// Registers the probes under /api/v1/health (older paths; server.ts also mounts /healthz and /readyz).
// Used by the container platform's health checks.
export async function healthRouter(app: FastifyInstance): Promise<void> {
  app.get("/live", getLiveCheckHandler)
  app.get("/ready", getReadyCheckHandler)
}
