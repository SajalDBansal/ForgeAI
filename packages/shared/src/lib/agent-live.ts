import {
  agentEventsChannel,
  agentLiveStateKey,
  agentLiveRevisionKey,
  type AgentEvent,
  type AgentSnapshot,
} from "../types/agent.js"
import { createSerialQueue } from "./serial-queue.js"

const LIVE_STATE_TTL_SECONDS = 60 * 60
const FINISHED = new Set(["SUCCEEDED", "FAILED", "CANCELLED"])

interface LiveRedis {
  get(key: string): Promise<string | null>
  eval(
    script: string,
    keys: number,
    ...args: (string | number)[]
  ): Promise<unknown>
}

// Updating the snapshot and publishing its revision must be one atomic Redis operation.
const SAVE_AND_PUBLISH = `
if (redis.call("get", KEYS[1]) or "") ~= ARGV[1] then return 0 end
if (redis.call("get", KEYS[2]) or "") ~= ARGV[6] then return 0 end
redis.call("set", KEYS[2], ARGV[7])
redis.call("set", KEYS[1], ARGV[2], "EX", ARGV[3])
redis.call("publish", ARGV[4], ARGV[5])
return 1`

export function parseAgentSnapshot(raw: string | null): AgentSnapshot {
  if (!raw) return { events: [], revision: 0 }
  try {
    const value = JSON.parse(raw)
    // Accept snapshots written before revisions were introduced.
    const events: unknown[] = Array.isArray(value) ? value : value.events
    return {
      events: events.filter(
        (event): event is AgentEvent =>
          typeof event === "object" &&
          event !== null &&
          "type" in event &&
          "runId" in event,
      ),
      revision: Number.isSafeInteger(value.revision) ? value.revision : 0,
    }
  } catch {
    return { events: [], revision: 0 }
  }
}

// Keeps one value per activity, joining deltas and retaining terminal statuses against late output.
export function foldAgentEvent(
  events: AgentEvent[],
  event: AgentEvent,
): AgentEvent[] {
  const status = events.find(
    (item) => item.runId === event.runId && item.type === "run.status",
  )
  if (status?.type === "run.status" && FINISHED.has(status.status))
    return events

  if (event.type === "run.status") {
    const reset =
      FINISHED.has(event.status) ||
      (status?.type === "run.status" && event.attempt > status.attempt)
    if (status?.type === "run.status" && event.attempt < status.attempt)
      return events
    if (
      status?.type === "run.status" &&
      event.attempt === status.attempt &&
      event.status === "QUEUED" &&
      status.status !== "QUEUED"
    )
      return events
    const kept = events.filter(
      (item) =>
        item.runId !== event.runId || (!reset && item.type !== "run.status"),
    )
    // A bounded set of terminal statuses is enough for reconnects without growing forever.
    const finished = kept.filter(
      (item) => item.type === "run.status" && FINISHED.has(item.status),
    )
    const expired = new Set(finished.slice(0, -20))
    return [...kept.filter((item) => !expired.has(item)), event]
  }

  const sameActivity = (item: AgentEvent) => {
    if (item.runId !== event.runId || item.type !== event.type) return false
    if (event.type === "text.delta")
      return item.type === "text.delta" && item.messageId === event.messageId
    if (event.type === "thinking.delta")
      return (
        item.type === "thinking.delta" && item.thinkingId === event.thinkingId
      )
    if ("seq" in event) return "seq" in item && item.seq === event.seq
    return true
  }
  const previous = events.find(sameActivity)
  let next = event
  if (event.type === "text.delta") {
    next = {
      ...event,
      text: (previous?.type === "text.delta" ? previous.text : "") + event.text,
    }
  } else if (event.type === "thinking.delta") {
    next = {
      ...event,
      text: (
        (previous?.type === "thinking.delta" ? previous.text : "") + event.text
      ).slice(-2_000),
    }
  } else if (event.type === "tool.output") {
    next = {
      ...event,
      chunk: (
        (previous?.type === "tool.output" ? previous.chunk : "") + event.chunk
      ).slice(-4_000),
    }
  }
  return previous
    ? events.map((item) => (sameActivity(item) ? next : item))
    : [...events, next]
}

// All producers share this publisher so concurrent services cannot overwrite each other's deltas.
export function createAgentEventPublisher(redis: LiveRedis) {
  const queue = createSerialQueue()
  function publish(projectId: string, event: AgentEvent): Promise<void> {
    return queue.run(projectId, async () => {
      const key = agentLiveStateKey(projectId)
      const revisionKey = agentLiveRevisionKey(projectId)
      for (;;) {
        const raw = await redis.get(key)
        const previousRevision = await redis.get(revisionKey)
        const current = parseAgentSnapshot(raw)
        // Keep revisions monotonic after the large, short-lived snapshot expires.
        const revision =
          Math.max(current.revision, Number(previousRevision) || 0) + 1
        const events = foldAgentEvent(current.events, event)
        if (events === current.events) return
        const next = { events, revision }
        const saved = await redis.eval(
          SAVE_AND_PUBLISH,
          2,
          key,
          revisionKey,
          raw ?? "",
          JSON.stringify(next),
          LIVE_STATE_TTL_SECONDS,
          agentEventsChannel(projectId),
          JSON.stringify({ ...event, revision }),
          previousRevision ?? "",
          revision,
        )
        if (saved === 1) return
      }
    })
  }
  return { publish, drain: queue.drain }
}
