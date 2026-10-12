import {
  LOGGER_OPTIONS,
  ORCHESTRATOR_REQUEST_TIMEOUT_MS,
  REQUEST_ID_HEADER,
  requestIdFrom,
} from "@forgeAI/shared"
import Fastify, { type FastifyInstance } from "fastify"
import { requireServiceToken } from "./lib/auth.js"
import { handleError, handleNotFound } from "./lib/error-handler.js"
import { capacityRouter } from "./router/capacity.router.js"
import { healthRouter } from "./router/health.router.js"
import { v1Routers } from "./router/index.js"

// Builds the Fastify app with service-token auth on every route.
// Called once from index.ts; no CORS because browsers never call this service.
export async function createServer(): Promise<FastifyInstance> {
  const orchestrator = Fastify({
    // Secrets (the service token, tokens in fields) are censored before anything is written.
    logger: LOGGER_OPTIONS,
    // Uses api-server's request id, so one id follows a request through both services' logs.
    genReqId: (req) => requestIdFrom(req.headers[REQUEST_ID_HEADER]),
    keepAliveTimeout: 30_000,
    // Idle-socket timeout: must outlast the longest request (a restart) or Node kills it.
    connectionTimeout: ORCHESTRATOR_REQUEST_TIMEOUT_MS + 30_000,
    maxRequestsPerSocket: 1000,
    // Time to receive a request, not to answer it; bodies here are tiny.
    requestTimeout: 30_000,
  })

  // Runs on every route, including unknown ones, so callers can't map paths.
  orchestrator.addHook("onRequest", requireServiceToken)

  // Set before the routes so every route uses them.
  orchestrator.setErrorHandler(handleError)
  orchestrator.setNotFoundHandler(handleNotFound)

  await orchestrator.register(healthRouter)
  await orchestrator.register(capacityRouter)
  await orchestrator.register(v1Routers, { prefix: "/api/v1" })

  return orchestrator
}
