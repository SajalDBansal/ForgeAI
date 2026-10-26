import Fastify from "fastify"
import { prisma } from "@forgeAI/database"
import { PermanentJobError } from "@forgeAI/jobs"
import type { TaskHandler } from "@forgeAI/jobs/worker"
import { LOGGER_OPTIONS } from "@forgeAI/shared"
import orchestratorPlugin from "../plugins/orchestrator.js"
import {
  prepareProjectGit,
  startProjectOnGithub,
} from "../service/git-vc.service.js"
import {
  liveProjectFilter,
  projectAccessFilter,
} from "../service/project-access-policy.js"
import { closeProjectEvents } from "../lib/project-events.js"
import { closeRedis } from "../lib/redis.js"
import { closeAgentQueue } from "../lib/agent-queue.js"

// Reuse the domain service's logger and HTTP pool; no public routes or listener.
const context = Fastify({ logger: LOGGER_OPTIONS })
await context.register(orchestratorPlugin)
await context.ready()

export const handle: TaskHandler = async (task) => {
  if (task.type !== "github.setup" && task.type !== "github.prepare")
    throw new PermanentJobError("invalid_payload")
  const where =
    task.type === "github.setup"
      ? projectAccessFilter(task.actorId, task.projectId, "write")
      : liveProjectFilter(task.actorId, task.projectId)
  if (!(await prisma.project.count({ where }))) return
  if (task.type === "github.setup")
    await startProjectOnGithub(context, task.projectId)
  else await prepareProjectGit(context, task.projectId)
}
export async function close(): Promise<void> {
  await context.close()
  await Promise.all([closeProjectEvents(), closeRedis(), closeAgentQueue()])
}
