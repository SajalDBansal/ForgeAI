import "dotenv/config"
import { createServer } from "node:http"
import { prisma } from "@forgeAI/database"
import {
  beginShutdown,
  checkReadiness,
  readinessResponse,
} from "@forgeAI/shared"
import { workerRoleSchema } from "@forgeAI/jobs"
import { createBackgroundWorker, type TaskHandler } from "@forgeAI/jobs/worker"

const role = workerRoleSchema.parse(process.argv[2])
const defaults = {
  audit: [3007, 8],
  cleanup: [3008, 2],
  github: [3009, 2],
  notification: [3010, 2],
} as const
const integer = (name: string, fallback: number) => {
  const value = Number(process.env[name] || fallback)
  if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid ${name}`)
  return value
}
const redisUrl = process.env.REDIS_URL
if (!redisUrl) throw new Error("Missing REDIS_URL")
const roleConfig = (await import(`./${role}.js`)) as {
  handle: TaskHandler
  close?: () => Promise<void>
}
const runtime = createBackgroundWorker({
  role,
  redisUrl,
  handle: roleConfig.handle,
  concurrency: integer("JOB_CONCURRENCY", defaults[role][1]),
  pollMs: integer("JOB_POLL_MS", 2_000),
})
let stopping = false
const health = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    response.writeHead(200).end("ok")
  } else if (request.method === "GET" && request.url === "/readyz") {
    void checkReadiness({ jobs: runtime.ready }).then((report) => {
      const { status, body } = readinessResponse(report)
      response
        .writeHead(status, { "content-type": "application/json" })
        .end(JSON.stringify(body))
    })
  } else response.writeHead(404).end()
})
health.listen(integer("WORKER_PORT", defaults[role][0]), () =>
  console.log(`[${role}-worker] started`),
)

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if (stopping) return
    stopping = true
    beginShutdown()
    const deadline = setTimeout(
      () => process.exit(1),
      integer("JOB_SHUTDOWN_SECONDS", 30) * 1_000,
    )
    deadline.unref()
    health.close()
    void runtime
      .close()
      .then(async () => {
        await roleConfig.close?.()
        await prisma.$disconnect()
        process.exit(0)
      })
      .catch(() => process.exit(1))
  })
