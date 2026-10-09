"use client"

import { useEffect, useMemo, useReducer } from "react"
import type {
  AgentEvent,
  AgentRunStatus,
  AgentSearchHit,
} from "@forgeAI/shared"

import { useProjectSocket } from "@/hooks/use-project-socket"
import { createAgentStream } from "@/lib/agent-stream"
import { useProjectStore } from "@/lib/project-store"

/** How much of a tool's output and of the model's reasoning to keep on screen. */
const MAX_TOOL_OUTPUT_CHARS = 4_000
const MAX_THINKING_CHARS = 2_000

export type LiveItem =
  /** A reply being written; replaced by the saved message with the same id. */
  | { kind: "text"; id: string; text: string }
  | { kind: "thinking"; id: string; text: string }
  | {
      kind: "tool"
      id: string
      tool: string
      summary: string
      output: string
      ok?: boolean
      durationMs?: number
    }

/** The knowledge graph's progress before the run starts (Q6). */
export type LiveIndex = Omit<
  Extract<AgentEvent, { type: "index.status" }>,
  "type" | "runId"
>

/** What one agent run is doing now, built from `agent:event` (I3). */
export interface LiveRun {
  runId: string
  status: AgentRunStatus
  attempt: number
  waitingOnMessageId?: string
  /** Cost so far, in millionths of a dollar. */
  costMicros?: number
  /** Text, reasoning and tool calls, in the order they happened. */
  items: LiveItem[]
  /** The project knowledge graph being brought up to date (Q6). */
  index?: LiveIndex
  /** What the graph search found: the related code and docs the agent was given (Q6). */
  search?: { query: string; hits: AgentSearchHit[] }
}

const FINISHED: AgentRunStatus[] = ["SUCCEEDED", "FAILED", "CANCELLED"]

type Action =
  | { type: "event"; event: AgentEvent }
  | { type: "snapshot"; events: AgentEvent[] }
  | { type: "clear" }

// Keeps the end of a growing string, so a long output can't grow without limit.
function keepTail(text: string, max: number): string {
  return text.length > max ? text.slice(text.length - max) : text
}

// Adds text to the reply or reasoning with this id, starting it at the end if it's new.
function appendText(
  items: LiveItem[],
  kind: "text" | "thinking",
  id: string,
  text: string,
  max = Infinity,
): LiveItem[] {
  if (!items.some((item) => item.id === id))
    return [...items, { kind, id, text }]
  return items.map((item) =>
    item.id === id && item.kind === kind
      ? { ...item, text: keepTail(item.text + text, max) }
      : item,
  )
}

// Changes the tool call with this seq (tool ids are "tool-<seq>").
function updateTool(
  items: LiveItem[],
  seq: number,
  change: (tool: Extract<LiveItem, { kind: "tool" }>) => LiveItem,
): LiveItem[] {
  return items.map((item) =>
    item.kind === "tool" && item.id === `tool-${seq}` ? change(item) : item,
  )
}

// Applies one live event to its run. A run we hear of mid-way (the tab opened late) starts here.
function applyEvent(runs: LiveRun[], event: AgentEvent): LiveRun[] {
  const existing = runs.find((run) => run.runId === event.runId)
  if (existing && FINISHED.includes(existing.status)) return runs
  let run: LiveRun = existing ?? {
    runId: event.runId,
    status: "RUNNING",
    attempt: 1,
    items: [],
  }

  switch (event.type) {
    case "run.status":
      // A retry starts over: what the earlier try showed is stale.
      if (event.attempt > run.attempt)
        run = {
          ...run,
          attempt: event.attempt,
          items: [],
          index: undefined,
          search: undefined,
        }
      run = {
        ...run,
        status: event.status,
        waitingOnMessageId: event.waitingOnMessageId,
      }
      // Finished: only replies not yet saved stay, until their saved message arrives.
      if (FINISHED.includes(event.status)) {
        run = {
          ...run,
          items: run.items.filter((item) => item.kind === "text"),
          index: undefined,
          search: undefined,
        }
      }
      break
    case "run.usage":
      run = { ...run, costMicros: event.costMicros }
      break
    case "text.delta":
      run = {
        ...run,
        items: appendText(run.items, "text", event.messageId, event.text),
      }
      break
    case "thinking.delta":
      run = {
        ...run,
        items: appendText(
          run.items,
          "thinking",
          event.thinkingId,
          event.text,
          MAX_THINKING_CHARS,
        ),
      }
      break
    case "tool.started": {
      const id = `tool-${event.seq}`
      if (!run.items.some((item) => item.id === id)) {
        run = {
          ...run,
          items: [
            ...run.items,
            {
              kind: "tool",
              id,
              tool: event.tool,
              summary: event.summary,
              output: "",
            },
          ],
        }
      }
      break
    }
    case "tool.output":
      run = {
        ...run,
        items: updateTool(run.items, event.seq, (tool) => ({
          ...tool,
          output: keepTail(tool.output + event.chunk, MAX_TOOL_OUTPUT_CHARS),
        })),
      }
      break
    case "index.status": {
      const { state, phase, done, total, counts, error } = event
      run = { ...run, index: { state, phase, done, total, counts, error } }
      break
    }
    case "search.done":
      run = { ...run, search: { query: event.query, hits: event.hits } }
      break
    case "tool.finished":
      run = {
        ...run,
        items: updateTool(run.items, event.seq, (tool) => ({
          ...tool,
          ok: event.ok,
          durationMs: event.durationMs,
          summary: event.summary ?? tool.summary,
        })),
      }
      break
  }

  return existing
    ? runs.map((r) => (r.runId === run.runId ? run : r))
    : [...runs, run]
}

// Drops replies that are now saved messages, and finished runs with nothing left to show.
function dropSaved(runs: LiveRun[], ids: Set<string>): LiveRun[] {
  const next = runs
    .map((run) => ({
      ...run,
      items: run.items.filter(
        (item) => !(item.kind === "text" && ids.has(item.id)),
      ),
    }))
    .filter((run) => !(FINISHED.includes(run.status) && run.items.length === 0))
  const changed =
    next.length !== runs.length ||
    next.some((run, i) => run.items.length !== runs[i]!.items.length)
  return changed ? next : runs
}

function reducer(runs: LiveRun[], action: Action): LiveRun[] {
  if (action.type === "event") return applyEvent(runs, action.event)
  if (action.type === "snapshot") return action.events.reduce(applyEvent, [])
  return []
}

// Follows the open project's agent activity: replies as they're written, tool calls, run status,
// and the knowledge graph's progress and findings. Live only (never saved): a tab that wasn't open sees the saved messages instead.
export function useAgentLive(): LiveRun[] {
  const socket = useProjectSocket()
  const messages = useProjectStore((s) => s.messages)
  const [runs, dispatch] = useReducer(reducer, [])

  useEffect(() => {
    if (!socket) return
    const stream = createAgentStream(
      (events) => dispatch({ type: "snapshot", events }),
      (event) => dispatch({ type: "event", event }),
    )
    socket.on("agent:event", stream.event)
    socket.on("agent:snapshot", stream.snapshot)
    socket.on("disconnect", stream.reset)
    const sync = () => socket.emit("agent:sync")
    socket.on("connect", sync)
    if (socket.connected) sync()
    return () => {
      socket.off("agent:event", stream.event)
      socket.off("agent:snapshot", stream.snapshot)
      socket.off("disconnect", stream.reset)
      socket.off("connect", sync)
      dispatch({ type: "clear" })
    }
  }, [socket])

  // A reply's saved message has arrived: show that instead of the live copy.
  const savedIds = useMemo(() => new Set(messages.map((m) => m.id)), [messages])
  return useMemo(() => dropSaved(runs, savedIds), [runs, savedIds])
}
