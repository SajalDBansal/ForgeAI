// The records of agent work (work plan I2, design in 10 §4). The tables are in
// packages/database; these are the shapes the API, the agent worker and the web share.
import { AgentRunStatus, FileChangeAction, UsageKind } from "./enum.js"

/** One request to the agent, on a project. */
export type AgentRun = {
  id: string
  projectId: string
  /** Null once the person's account is gone. */
  requestedById: string | null
  status: AgentRunStatus
  model: string | null
  attempts: number
  error: string | null
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
}

/** One tool call inside a run; `seq` is its order (1, 2, 3…). */
export type AgentStep = {
  id: string
  runId: string
  seq: number
  tool: string
  input: unknown
  outputSummary: string | null
  durationMs: number | null
  createdAt: Date
}

/** A file a run changed. */
export type AgentFileChange = {
  id: string
  runId: string
  path: string
  action: FileChangeAction
  additions: number
  deletions: number
}

/** What something cost. `costMicros` is millionths of a US dollar. */
export type UsageEvent = {
  id: string
  workspaceId: string
  projectId: string | null
  runId: string | null
  kind: UsageKind
  model: string | null
  tokensIn: number
  tokensOut: number
  seconds: number
  costMicros: number
  createdAt: Date
}

// ---------- LIVE EVENTS (I3) ----------
// What the agent is doing right now, on Redis `agent-events:{projectId}`. ws-server forwards
// it to every open tab as `agent:event`; a short-lived Redis snapshot catches up late tabs.
// Durable history is a ChatMessage instead (on `project-events`, with `runId` set):
//   - the person's request and answers (TEXT);
//   - the agent's finished reply (TEXT);
//   - a question or a request for permission (QUESTION, PERMISSION);
//   - the plan and its progress (TASK, re-sent under the same id as it moves on);
//   - the files a run changed (FILES), and limits hit or failures (WARNING).
// Indexing progress and what the graph search found (stage Q6) are live too: they matter while the
// run starts, and the hits belong to the agent's context, not the chat.

export const AGENT_EVENTS_CHANNEL_PREFIX = "agent-events:"
export const AGENT_RUN_INPUT_CHANNEL_PREFIX = "agent-run-input:"
export const AGENT_LIVE_STATE_KEY_PREFIX = "agent-live:"

// Builds the Redis channel carrying a project's live agent events.
// The agent worker and api-server publish to it; ws-server subscribes.
export function agentEventsChannel(projectId: string): string {
  return `${AGENT_EVENTS_CHANNEL_PREFIX}${projectId}`
}

// Redis key holding the compact live state for a project's current run. ws-server reads it when
// a tab joins mid-run, then sends the events to that socket as a snapshot.
export function agentLiveStateKey(projectId: string): string {
  return `${AGENT_LIVE_STATE_KEY_PREFIX}${projectId}`
}

// A person's message added while a run is already working. api-server publishes this
// directly to the worker holding the run, which reads it after the current model step.
export function agentRunInputChannel(runId: string): string {
  return `${AGENT_RUN_INPUT_CHANNEL_PREFIX}${runId}`
}

export type AgentRunInput = {
  type: "user.message"
  runId: string
  messageId: string
  content: string
  createdAt: string
}

export type AgentEvent = AgentEventData & { revision?: number }

export interface AgentSnapshot {
  events: AgentEvent[]
  revision: number
}

type AgentEventData =
  /** The run moved on (queued, started, waiting for an answer, finished). */
  | {
      type: "run.status"
      runId: string
      status: AgentRunStatus
      /** 1 on the first try; higher after a retry, when anything shown for an earlier try is stale. */
      attempt: number
      /** WAITING_INPUT: the QUESTION or PERMISSION message being waited on. */
      waitingOnMessageId?: string
      /** FAILED: what went wrong, fit to show people. */
      error?: string
    }
  /** The run's totals so far, after each model call. */
  | {
      type: "run.usage"
      runId: string
      tokensIn: number
      tokensOut: number
      costMicros: number
    }
  /** Part of a reply being written. `messageId` is the id it's saved under when finished. */
  | { type: "text.delta"; runId: string; messageId: string; text: string }
  /** Part of the model's reasoning before it answers or acts. Shown while it happens, never saved. */
  | { type: "thinking.delta"; runId: string; thinkingId: string; text: string }
  /** A tool call began; `summary` is for people, e.g. "Reading app/page.tsx". */
  | {
      type: "tool.started"
      runId: string
      seq: number
      tool: string
      summary: string
    }
  /** Output of a running tool (a command's stdout and stderr), so people can watch it. */
  | { type: "tool.output"; runId: string; seq: number; chunk: string }
  /** A tool call ended. */
  | {
      type: "tool.finished"
      runId: string
      seq: number
      ok: boolean
      durationMs: number
      summary?: string
    }
  /** The project knowledge graph being brought up to date before the run (stage Q6). */
  | {
      type: "index.status"
      runId: string
      state: AgentIndexState
      /** While indexing: downloading, unpacking, scanning, parsing, embedding, linking or summarizing. */
      phase?: string
      done?: number
      total?: number
      /** When done: what this index changed. */
      counts?: {
        filesChanged: number
        blocksEmbedded: number
        blocksReused: number
      }
      /** When failed: what went wrong, fit to show people. The run carries on without the graph. */
      error?: string
    }
  /** What the graph search found for the run: the "Related code and docs" the agent was given (Q6). */
  | {
      type: "search.done"
      runId: string
      query: string
      hits: AgentSearchHit[]
    }

/** checking, then up_to_date or indexing, then done; failed at any point. */
export type AgentIndexState =
  "checking" | "up_to_date" | "indexing" | "done" | "failed"

/** One place the graph search found. Paths are project-relative, the same as the editor uses. */
export interface AgentSearchHit {
  kind: "code" | "doc" | "summary"
  path: string
  /** The function or class, the doc section, or null for a folder summary. */
  name?: string | null
  startLine?: number
  endLine?: number
}

// ---------- THE RUN QUEUE (I5) ----------

/** The BullMQ queue api-server puts runs on and the agent worker takes them from. */
export const AGENT_RUNS_QUEUE = "agent-runs"

/** One job on it: only ids. The worker reads everything else from Postgres. */
export interface AgentRunJob {
  runId: string
  projectId: string
  /** The reply waking a waiting run; gives each continuation its own queue identity. */
  messageId?: string
}

export function agentRunJobId(job: AgentRunJob): string {
  return job.messageId ? `${job.runId}-${job.messageId}` : job.runId
}

// This small counter survives snapshot expiry and is removed when the project is deleted.
export function agentLiveRevisionKey(projectId: string): string {
  return `${agentLiveStateKey(projectId)}:revision`
}

// The Redis key held by the worker running one of a project's runs.
// One run at a time per project: every run shares the project's one sandbox and files.
export function agentProjectLockKey(projectId: string): string {
  return `agent:project:${projectId}`
}

// Mutating agent-worker -> orchestrator requests carry the project lock token here.
// The orchestrator checks Redis before touching the sandbox, fencing stale workers.
export const AGENT_PROJECT_LEASE_HEADER = "x-forgeai-project-lease"
