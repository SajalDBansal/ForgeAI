// runAgent(): one agent run on pi's agent core (work plan I4, design in 10 §4.1). pi does the loop:
// model call, tool calls, results, repeat. This file turns its events into ours (AgentEvent, I3),
// adds up usage, and hands back the transcript so the worker can save it and carry on later.
// Nothing outside this package knows pi is underneath.

import { randomUUID } from "node:crypto"
import {
  Agent,
  type AgentEvent as PiEvent,
  type AgentMessage,
  type AgentTool,
  type AgentToolResult,
} from "@earendil-works/pi-agent-core"
import type {
  Api,
  AssistantMessage,
  Model,
  TSchema,
} from "@earendil-works/pi-ai"
import type { AgentEvent } from "@forgeAI/shared"

import type { AgentConfig, AgentThinkingLevel } from "./config.js"
import type { HistoryTurn } from "./context.js"
import { agentModels, resolveModel } from "./models.js"

/** A tool for the agent: a pi tool plus a one-line description of a call, for people. */
export type ForgeTool<TParams extends TSchema = TSchema> =
  AgentTool<TParams> & {
    /** E.g. "Reading app/page.tsx". Defaults to the tool's label. */
    summarize?: (args: Record<string, unknown>) => string
  }

/** One model call, for a UsageEvent row (I2). */
export interface ModelCall {
  model: string
  tokensIn: number
  tokensOut: number
  /** Millionths of a US dollar, from pi-ai's price catalog (0 for free models). */
  costMicros: number
}

/** A reply the agent wrote; the worker saves it as a ChatMessage under `messageId` (I3). */
export interface AgentReply {
  messageId: string
  text: string
}

export interface RunAgentOptions {
  config: AgentConfig
  /** The run's id: sent as the session id, which turns on prompt caching where it exists. */
  runId: string
  /** Which of the two models. Default "code". */
  model?: "code" | "fast"
  /** Exact model id for one call, used for a fallback retry. */
  modelId?: string
  thinking?: AgentThinkingLevel
  system: string
  /** The saved transcript so far (from an earlier `result.messages`), to carry on a run after an answer or a restart. */
  messages?: AgentMessage[]
  /** Earlier exchanges as words only (`buildContext().history`), for a new run. Ignored when `messages` is given. */
  history?: HistoryTurn[]
  /** The person's new message, as typed. Omit to carry on from `messages` (e.g. after an answer). */
  prompt?: string
  tools?: ForgeTool[]
  /** Stop after this many model calls (default 40), so a run can't loop without end. */
  maxTurns?: number
  /** Stop after this many input+output tokens once a tool turn finishes. */
  maxTokens?: number
  /** Stop after this many cost micros once a tool turn finishes. */
  maxCostMicros?: number
  signal?: AbortSignal
  /** Live events for `agent-events` (I3). `run.status` is the worker's to send, not this. */
  onEvent?: (event: AgentEvent) => void
  /** Lets tools and the worker correlate pi's tool call id with our visible step number. */
  toolSeqs?: Map<string, number>
  /** Last saved step, so a continuation cannot overwrite an earlier tool call. */
  initialToolSeq?: number
  /** Called once a tool finishes, so the worker can save AgentStep rows. */
  onToolStep?: (step: {
    seq: number
    tool: string
    input: unknown
    outputSummary?: string
    durationMs: number
  }) => void | Promise<void>
}

export interface RunAgentResult {
  /** The whole transcript, to save and pass back as `messages` next time. */
  messages: AgentMessage[]
  replies: AgentReply[]
  calls: ModelCall[]
  tokensIn: number
  tokensOut: number
  costMicros: number
  /** How it ended: "stop" (done), "aborted", "error", "length", "max_turns", "max_tokens", or "max_cost". */
  stopReason: string
  error?: string
}

export interface AgentRunHandle {
  /** A message from the person while the run is going; read after the current step (pi's "steer"). */
  steer(text: string): void
  /** A message for when the agent would otherwise stop (pi's "follow-up"). */
  followUp(text: string): void
  done: Promise<RunAgentResult>
}

// Text of a tool's partial result, which our tools send as the new output since the last update.
function resultText(result: AgentToolResult<unknown> | undefined): string {
  return (result?.content ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
}

function userMessage(text: string): AgentMessage {
  return { role: "user", content: text, timestamp: Date.now() }
}

// Starts a run and returns at once; `done` settles when the run ends. Never rejects: failures come
// back as `stopReason: "error"` with `error`, so the worker always has a transcript to save.
export function runAgent(options: RunAgentOptions): AgentRunHandle {
  const { config, onEvent = () => {} } = options
  const maxTurns = options.maxTurns ?? 40
  const tools = options.tools ?? []
  const model = resolveModel(
    config,
    options.modelId ??
      (options.model === "fast" ? config.modelFast : config.modelCode),
  )
  const models = agentModels(config)

  // A saved transcript starts with the system prompt of its time; this run's (fresh context) replaces it.
  const earlier = options.messages?.length
    ? options.messages.filter(
        (message, i) => !(i === 0 && message.role === "system"),
      )
    : historyMessages(options.history ?? [], model)

  let turns = 0
  let hitMaxTurns = false
  let hitTokenLimit = false
  let hitCostLimit = false
  const agent = new Agent({
    initialState: {
      systemPrompt: options.system,
      model,
      thinkingLevel: options.thinking ?? config.thinking,
      tools,
      ...(earlier.length ? { messages: earlier } : {}),
    },
    streamFn: models.streamSimple.bind(models),
    getApiKey: () => config.apiKey,
    sessionId: options.runId,
    // Read-only tools may run together; tools that change things mark themselves "sequential".
    toolExecution: "parallel",
    finishTurn: (turn) => {
      turns += 1
      // Only a turn that called tools would go on; one that just answered ends by itself.
      const totals = sumCalls(calls)
      if (
        options.maxTokens &&
        totals.tokensIn + totals.tokensOut >= options.maxTokens &&
        turn.toolResults.length > 0
      ) {
        hitTokenLimit = true
        return { action: "end" }
      }
      if (
        options.maxCostMicros &&
        totals.costMicros >= options.maxCostMicros &&
        turn.toolResults.length > 0
      ) {
        hitCostLimit = true
        return { action: "end" }
      }
      if (turns < maxTurns || turn.toolResults.length === 0) return undefined
      hitMaxTurns = true
      return { action: "end" }
    },
  })

  // ---------- pi events → our events ----------
  const replies = new Map<AssistantMessage, AgentReply>()
  let current: AgentReply | undefined
  const tool = new Map<
    string,
    { seq: number; startedAt: number; name: string; args: unknown }
  >()
  let seq = options.initialToolSeq ?? 0
  const calls: ModelCall[] = []

  agent.subscribe((event: PiEvent) => {
    switch (event.type) {
      case "message_start":
        // Each assistant message gets the id its text will be saved under.
        if (event.message.role === "assistant")
          current = { messageId: randomUUID(), text: "" }
        return
      case "message_update": {
        const e = event.assistantMessageEvent
        if (!current) return
        if (e.type === "text_delta") {
          current.text += e.delta
          onEvent({
            type: "text.delta",
            runId: options.runId,
            messageId: current.messageId,
            text: e.delta,
          })
        } else if (e.type === "thinking_delta") {
          onEvent({
            type: "thinking.delta",
            runId: options.runId,
            thinkingId: `${current.messageId}-thinking`,
            text: e.delta,
          })
        }
        return
      }
      case "message_end": {
        if (event.message.role !== "assistant" || !current) return
        const message = event.message as AssistantMessage
        if (current.text.trim()) replies.set(message, current)
        current = undefined
        calls.push({
          model: message.model,
          tokensIn:
            message.usage.input +
            message.usage.cacheRead +
            message.usage.cacheWrite,
          tokensOut: message.usage.output,
          costMicros: Math.round(message.usage.cost.total * 1_000_000),
        })
        const totals = sumCalls(calls)
        onEvent({ type: "run.usage", runId: options.runId, ...totals })
        return
      }
      case "tool_execution_start": {
        seq += 1
        tool.set(event.toolCallId, {
          seq,
          startedAt: Date.now(),
          name: event.toolName,
          args: event.args,
        })
        options.toolSeqs?.set(event.toolCallId, seq)
        const definition = tools.find((t) => t.name === event.toolName)
        const summary =
          definition?.summarize?.(event.args ?? {}) ??
          definition?.label ??
          event.toolName
        onEvent({
          type: "tool.started",
          runId: options.runId,
          seq,
          tool: event.toolName,
          summary,
        })
        return
      }
      case "tool_execution_update": {
        const started = tool.get(event.toolCallId)
        const chunk = resultText(event.partialResult)
        if (started && chunk)
          onEvent({
            type: "tool.output",
            runId: options.runId,
            seq: started.seq,
            chunk,
          })
        return
      }
      case "tool_execution_end": {
        const started = tool.get(event.toolCallId)
        if (!started) return
        const durationMs = Date.now() - started.startedAt
        void options.onToolStep?.({
          seq: started.seq,
          tool: started.name,
          input: started.args,
          outputSummary:
            resultText(event.result)
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 500) || undefined,
          durationMs,
        })
        options.toolSeqs?.delete(event.toolCallId)
        onEvent({
          type: "tool.finished",
          runId: options.runId,
          seq: started.seq,
          ok: !event.isError,
          durationMs,
        })
        return
      }
    }
  })

  const abort = () => agent.abort()
  options.signal?.addEventListener("abort", abort, { once: true })

  const done = (async (): Promise<RunAgentResult> => {
    try {
      if (options.prompt !== undefined) await agent.prompt(options.prompt)
      else await agent.continue()
    } catch (error) {
      // pi reports model failures in the transcript; this is for anything else (bad setup).
      return finish(
        "error",
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      options.signal?.removeEventListener("abort", abort)
    }
    const last = [...agent.state.messages]
      .reverse()
      .find((m) => m.role === "assistant") as AssistantMessage | undefined
    if (hitMaxTurns)
      return finish("max_turns", `Stopped after ${maxTurns} steps`)
    if (hitTokenLimit)
      return finish("max_tokens", `Stopped after ${options.maxTokens} tokens`)
    if (hitCostLimit)
      return finish(
        "max_cost",
        `Stopped after ${options.maxCostMicros} cost micros`,
      )
    return finish(
      last?.stopReason ?? "stop",
      agent.state.errorMessage ?? last?.errorMessage,
    )
  })()

  function finish(stopReason: string, error?: string): RunAgentResult {
    return {
      messages: agent.state.messages,
      replies: [...replies.values()],
      calls,
      ...sumCalls(calls),
      stopReason,
      ...(error && { error }),
    }
  }

  return {
    steer: (text) => agent.steer(userMessage(text)),
    followUp: (text) => agent.followUp(userMessage(text)),
    done,
  }
}

// Earlier exchanges as real turns. The agent's are marked as this model's replies (plain text, no
// provider signatures), which every provider accepts.
function historyMessages(
  turns: HistoryTurn[],
  model: Model<Api>,
): AgentMessage[] {
  const timestamp = Date.now()
  return turns.map((turn): AgentMessage =>
    turn.role === "user"
      ? { role: "user", content: turn.text, timestamp }
      : {
          role: "assistant",
          content: [{ type: "text", text: turn.text }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
          stopReason: "stop",
          timestamp,
        },
  )
}

function sumCalls(calls: ModelCall[]): {
  tokensIn: number
  tokensOut: number
  costMicros: number
} {
  return calls.reduce(
    (sum, call) => ({
      tokensIn: sum.tokensIn + call.tokensIn,
      tokensOut: sum.tokensOut + call.tokensOut,
      costMicros: sum.costMicros + call.costMicros,
    }),
    { tokensIn: 0, tokensOut: 0, costMicros: 0 },
  )
}
