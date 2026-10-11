import type { AgentRunJob, AgentRunStatus } from "@forgeAI/shared"

export type PendingRunForReconcile = {
  id: string
  projectId: string
  status: Extract<AgentRunStatus, "QUEUED" | "WAITING_INPUT">
}

export function jobForPendingRun(
  run: PendingRunForReconcile,
  waitingReplyId?: string,
): AgentRunJob | undefined {
  if (run.status === "QUEUED") {
    return { runId: run.id, projectId: run.projectId }
  }
  if (!waitingReplyId) return undefined
  return { runId: run.id, projectId: run.projectId, messageId: waitingReplyId }
}
