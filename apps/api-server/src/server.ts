import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import {
  browserCorsOriginAllowed,
  LOGGER_OPTIONS,
  REQUEST_ID_HEADER,
  requestIdFrom,
} from "@forgeAI/shared"
import Fastify, { type FastifyInstance } from "fastify"
import { ENV_CONFIG } from "./lib/envConfig.js"
import { closeProjectEvents } from "./lib/project-events.js"
import { closeAgentQueue } from "./lib/agent-queue.js"
import { closeRedis } from "./lib/redis.js"
import errorHandlerPlugin from "./plugins/error-handler.js"
import orchestratorPlugin from "./plugins/orchestrator.js"
import requestContextPlugin from "./plugins/request-context.js"
import browserOriginGuardPlugin from "./plugins/browser-origin-guard.js"
import publicAbuseLimitPlugin from "./plugins/public-abuse-limit.js"
import {
  getLiveCheckHandler,
  getReadyCheckHandler,
} from "./controller/health.controller.js"
import { v1Routers } from "./router/index.js"

/**
 * Largest request body most routes accept (Fastify's default is 1 MB). The biggest normal body
 * is a 10,000-character chat message (~40 KB at most); the file save route sets its own, bigger limit.
 */
const BODY_LIMIT_BYTES = 256 * 1024

// Builds the Fastify app with CORS, error handling, the orchestrator client pool and all v1 routes.
// Called once from index.ts at boot.
export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({
    // Secrets (auth headers, tokens in URLs and fields) are censored before anything is written.
    logger: LOGGER_OPTIONS,
    // Every request gets an id (`reqId` in each log line), reusing the caller's x-request-id if safe.
    genReqId: (req) => requestIdFrom(req.headers[REQUEST_ID_HEADER]),
    // A request can't make the server hold more than this in memory (answered with 413).
    bodyLimit: BODY_LIMIT_BYTES,
    // Only trust X-Forwarded-* when deployment explicitly says a trusted proxy is in front.
    trustProxy: ENV_CONFIG.TRUST_PROXY,
  })

  await app.register(cors, {
    origin: (origin, callback) =>
      callback(
        null,
        browserCorsOriginAllowed(origin, [
          ENV_CONFIG.CLIENT_ORIGIN,
          ENV_CONFIG.BETTER_AUTH_URL,
        ]),
      ),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Idempotency-Key",
      "X-Request-Id",
    ],
    // Lets the browser read the id, so an error message can show it.
    exposedHeaders: [REQUEST_ID_HEADER],
    credentials: true,
    maxAge: 86400,
  })

  // Security headers: HTTPS only (HSTS), never sniff a JSON response as a page (nosniff), and more.
  await app.register(helmet, {
    // We only send JSON: even if a response is opened as a page, nothing in it may run or load.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    // The web app is another subdomain of the same site, so it may load what we serve.
    crossOriginResourcePolicy: { policy: "same-site" },
  })

  // Registered before the routes so every route uses them.
  await app.register(requestContextPlugin)
  await app.register(browserOriginGuardPlugin)
  await app.register(publicAbuseLimitPlugin)
  await app.register(errorHandlerPlugin)
  await app.register(orchestratorPlugin)

  // Probes at the root, where Kubernetes expects them.
  app.get("/healthz", getLiveCheckHandler)
  app.get("/readyz", getReadyCheckHandler)

  await app.register(v1Routers, { prefix: "/api/v1" })

  app.addHook("onClose", async () => {
    await Promise.all([closeRedis(), closeProjectEvents(), closeAgentQueue()])
  })

  return app
}
