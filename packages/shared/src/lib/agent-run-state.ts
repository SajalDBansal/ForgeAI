import type { AgentRunStatus } from "../types/enum.js"

export const USER_CANCELLED_AGENT_RUN_MESSAGE = "Cancelled by user."

export const SHUTDOWN_STOPPED_AGENT_RUN_MESSAGE =
  "The agent stopped because this worker is shutting down. Ask again to continue."

export type AgentRunAbortReason = "user_cancelled" | "worker_shutdown"

export function liveAttemptForRun(attempts: number): number {
  return Math.max(1, attempts)
}

export function terminalStatusForAbort(reason: AgentRunAbortReason): {
  status: Extract<AgentRunStatus, "CANCELLED" | "FAILED">
  error: string
} {
  if (reason === "user_cancelled")
    return { status: "CANCELLED", error: USER_CANCELLED_AGENT_RUN_MESSAGE }
  return { status: "FAILED", error: SHUTDOWN_STOPPED_AGENT_RUN_MESSAGE }
}
