import {
  AGENT_RUNS_QUEUE,
  agentRunJobId,
  createAgentEventPublisher,
  agentRunInputChannel,
  type AgentEvent,
  type AgentRunInput,
  type AgentRunJob,
} from "@forgeAI/shared"
import { Queue } from "bullmq"
import { Redis } from "ioredis"

import { ENV_CONFIG } from "./envConfig.js"
import { redis } from "./project-events.js"
const liveEvents = createAgentEventPublisher(redis)

// The queue's own connection (BullMQ wants one it controls). A failing command errors after one
// retry, so a send fails quickly instead of hanging while Redis is down.
const connection = new Redis(ENV_CONFIG.REDIS_URL, { maxRetriesPerRequest: 1 })
connection.on("error", (err) =>
  console.error("[agent-queue] redis error:", err),
)

// Runs waiting for the agent worker (work plan I5). Finished jobs are kept briefly for debugging;
// the run's real record is the AgentRun row.
const agentRunsQueue = new Queue<AgentRunJob>(AGENT_RUNS_QUEUE, {
  connection,
  defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 1000 },
})

// A reply gets a new job id; retrying the same delivery is still a no-op.
export async function enqueueAgentRun(job: AgentRunJob): Promise<void> {
  await agentRunsQueue.add("run", job, { jobId: agentRunJobId(job) })
}

export async function removeAgentRunJob(job: AgentRunJob): Promise<void> {
  const queued = await agentRunsQueue.getJob(agentRunJobId(job))
  await queued?.remove()
}

// Publishes a live agent event (I3) for ws-server to forward to the project's tabs.
export function publishAgentEvent(projectId: string, event: AgentEvent): void {
  liveEvents.publish(projectId, event).catch((err) => {
    console.error("[agent-queue] event publish failed:", err)
  })
}

// Tells the worker already holding a run about a new user message for that run (I5c).
export function publishAgentRunInput(input: AgentRunInput): void {
  redis
    .publish(agentRunInputChannel(input.runId), JSON.stringify(input))
    .catch((err) => {
      console.error("[agent-queue] input publish failed:", err)
    })
}

// Closes the queue and its connection. Called once from server.ts on shutdown.
export async function closeAgentQueue(): Promise<void> {
  await liveEvents.drain()
  await agentRunsQueue.close().catch(() => undefined)
  await connection.quit().catch(() => undefined)
}
