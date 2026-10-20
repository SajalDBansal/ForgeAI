import "dotenv/config"

import { createServer } from "node:http"
import { prisma } from "@forgeAI/database"
import {
  AGENT_RUNS_QUEUE,
  beginShutdown,
  checkReadiness,
  readinessResponse,
  type AgentRunJob,
} from "@forgeAI/shared"
import { Worker } from "bullmq"
import { Redis } from "ioredis"

import { ENV_CONFIG } from "./envConfig.js"
import { checkRedis, closeRedis } from "./redis.js"
import {
  abortActiveRunsForShutdown,
  closeRunQueue,
  processRun,
  startRunReconciler,
} from "./runs.js"

// The agent worker (work plan I5): takes runs off the `agent-runs` queue and works them, one per
// project at a time. It never touches a sandbox itself: sandbox work goes to the orchestrator over
// HTTP, and live events go out on Redis for ws-server to deliver (10 §4.4).

// BullMQ's own connection: workers block on Redis, which needs maxRetriesPerRequest: null.
const queueConnection = new Redis(ENV_CONFIG.REDIS_URL, {
  maxRetriesPerRequest: null,
})
queueConnection.on("error", (err) => console.error("[agent-worker:queue]", err))

const worker = new Worker<AgentRunJob>(AGENT_RUNS_QUEUE, processRun, {
  connection: queueConnection,
  concurrency: ENV_CONFIG.WORKER_CONCURRENCY,
})
worker.on("error", (err) => console.error("[agent-worker] worker error:", err))
worker.on("failed", (job, err) =>
  console.error("[agent-worker] job failed:", job?.id, err.message),
)

const stopRunReconciler = startRunReconciler()

// ---------- health ----------
// Liveness checks nothing (a Redis blip mustn't get it restarted); readiness checks Redis and Postgres.
const health = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ status: "ok" }))
    return
  }
  if (request.method === "GET" && request.url === "/readyz") {
    void checkReadiness({
      redis: checkRedis,
      postgres: async () => void (await prisma.$queryRaw`SELECT 1`),
    }).then((report) => {
      if (!report.ready)
        console.warn("[agent-worker] not ready:", report.errors)
      const { status, body } = readinessResponse(report)
      response
        .writeHead(status, { "content-type": "application/json" })
        .end(JSON.stringify(body))
    })
    return
  }
  response.writeHead(404).end()
})
health.listen(ENV_CONFIG.PORT, () =>
  console.log(
    `[agent-worker] working the ${AGENT_RUNS_QUEUE} queue; health on :${ENV_CONFIG.PORT}`,
  ),
)

// ---------- shutdown ----------
// On deploys and Ctrl+C: stop taking runs, abort in-flight model/tool work so each run gets one
// terminal state, then close connections within the grace period.
let shuttingDown = false
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (shuttingDown) process.exit(1)
    shuttingDown = true
    beginShutdown()
    stopRunReconciler()
    abortActiveRunsForShutdown()
    console.log(
      `[agent-worker] received ${signal}, stopping active runs, then exiting`,
    )
    const forceExit = setTimeout(
      () => process.exit(1),
      ENV_CONFIG.SHUTDOWN_GRACE_SECONDS * 1_000,
    )
    forceExit.unref()
    void worker
      .close()
      .then(() =>
        Promise.all([
          closeRunQueue(),
          closeRedis(),
          queueConnection.quit().catch(() => undefined),
          prisma.$disconnect(),
        ]),
      )
      .then(() => process.exit(0))
  })
}
