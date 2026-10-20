// Streams a prepared run, then saves replies under their live IDs with its transcript and usage.

import {
  agentConfigFromEnv,
  runAgent,
  sortRun,
  type AgentRunHandle,
  type AgentMessage,
  type AgentThinkingLevel,
  type ModelCall,
  type RunAgentResult,
  type SortKind,
  type SortModel,
  type SortResult,
} from "@forgeAI/agent"
import { prisma, type AgentRun, type Prisma } from "@forgeAI/database"
import type { AgentEvent, AgentRunInput } from "@forgeAI/shared"

import type { PreparedRun } from "./prepare.js"
import { ENV_CONFIG } from "./envConfig.js"
import { createRedactor } from "./guardrails.js"
import {
  publishAgentEvent,
  publishChatMessage,
  watchRunInputs,
} from "./redis.js"
import { RunStop, secretRedactions } from "./services.js"
import { buildAgentTools } from "./tools.js"

// Read once at startup: a worker with no model settings fails at boot, not on the first message.
const config = agentConfigFromEnv(process.env)

const BUSY_RETRY_MS = [2_000, 4_000, 8_000]
const STREAM_FLUSH_MS = 50

type AnswerRoute = {
  kind: SortKind
  model: SortModel
  thinking: AgentThinkingLevel
  system: string
}

export interface AnswerResult {
  /** User messages this answer accepted into the model run. */
  answeredMessageIds: string[]
  status: "done" | "waiting_input"
  waitingOnMessageId?: string
}

// Runs the model on a prepared run. Throws RunStop (the run fails, with that message in the chat) when
// it didn't finish properly; whatever it did write is saved first.
export async function answer(
  run: AgentRun,
  prepared: PreparedRun,
  signal?: AbortSignal,
): Promise<AnswerResult> {
  const { context } = prepared
  // Earlier prompts were already handled before this continuation paused for input.
  const previousMessages = await prisma.chatMessage.findMany({
    where: {
      runId: run.id,
      role: "USER",
      createdAt: { lt: prepared.messageCreatedAt },
    },
    select: { id: true },
  })
  const answeredMessageIds = new Set(
    previousMessages.map((message) => message.id),
  )
  answeredMessageIds.add(prepared.messageId)
  const inputRedactor = createRedactor(
    await secretRedactions(run.projectId, prepared.requestedById, signal),
  )
  const sorted =
    run.status === "WAITING_INPUT"
      ? ({
          kind: "change",
          model: "code",
          thinking: config.thinking,
          title: "Continue run",
        } satisfies SortResult)
      : await sortRun(config, run.id, context, prepared.message).catch(
          (error): SortResult => ({
            kind: "change",
            model: "code",
            thinking: config.thinking,
            title: "Requested change",
            error: error instanceof Error ? error.message : String(error),
          }),
        )
  if (sorted.error)
    console.warn(
      `[agent-worker] sorter fallback for run ${run.id}:`,
      sorted.error,
    )

  if (sorted.kind === "unclear") {
    const waitingOnMessageId = await saveQuestion(
      run,
      sorted.question ?? "What should I change or check?",
    )
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { model: sorted.call?.model ?? config.modelFast },
    })
    await recordUsage(run, prepared.workspaceId, [
      ...prepared.calls,
      ...callList(sorted.call),
    ])
    return {
      answeredMessageIds: [...answeredMessageIds],
      status: "waiting_input",
      waitingOnMessageId,
    }
  }

  const route = routeFor(context.system, sorted, prepared.projectMode)
  const existingPlan = await planText(run.id)
  if (existingPlan) route.system = withPlan(route.system, existingPlan)
  const planCalls: ModelCall[] = []
  const waitingOnPlan = await planIfNeeded(run, prepared, route, planCalls)
  if (waitingOnPlan) {
    await recordUsage(run, prepared.workspaceId, [
      ...prepared.calls,
      ...callList(sorted.call),
      ...planCalls,
    ])
    return {
      answeredMessageIds: [...answeredMessageIds],
      status: "waiting_input",
      waitingOnMessageId: waitingOnPlan,
    }
  }

  const extraInputs: AgentRunInput[] = []
  let active: AgentRunHandle | undefined
  let bufferingInputs = true
  let acceptingInputs = true

  const acceptInput = (input: AgentRunInput) => {
    if (!acceptingInputs) return
    if (!active && !bufferingInputs) return
    if (input.runId !== run.id || answeredMessageIds.has(input.messageId))
      return
    answeredMessageIds.add(input.messageId)
    const content = inputRedactor.text(input.content)
    extraInputs.push({ ...input, content })
    active?.steer(content)
  }

  const unwatch = await watchRunInputs(run.id, acceptInput)
  let result: RunAgentResult
  try {
    for (const input of await attachedUserMessages(
      run.id,
      prepared.messageId,
      prepared.messageCreatedAt,
    ))
      acceptInput(input)
    result = await runWithBusyRetries(
      run,
      prepared,
      route,
      extraInputs,
      (handle) => {
        active = handle
      },
      (value) => {
        bufferingInputs = value
      },
      signal,
    )
    acceptingInputs = false
  } finally {
    active = undefined
    await unwatch()
  }

  for (const reply of result.replies)
    await saveReply(run, reply.messageId, reply.text)

  await prisma.agentRun.update({
    where: { id: run.id },
    // A JSON round trip: pi's messages are plain data, and this drops anything that isn't.
    data: {
      model: result.calls.at(-1)?.model ?? config.modelCode,
      transcript: JSON.parse(
        JSON.stringify(result.messages),
      ) as Prisma.InputJsonValue,
    },
  })
  await recordUsage(run, prepared.workspaceId, [
    ...prepared.calls,
    ...callList(sorted.call),
    ...planCalls,
    ...result.calls,
  ])

  const waitingOnQuestion = await waitingQuestionId(run.id)
  if (waitingOnQuestion) {
    return {
      answeredMessageIds: [...answeredMessageIds],
      status: "waiting_input",
      waitingOnMessageId: waitingOnQuestion,
    }
  }
  if (result.stopReason !== "stop") throw new RunStop(stopMessage(result))
  if (result.replies.length === 0) {
    throw new RunStop(
      "The agent finished without writing an answer. Try asking again.",
    )
  }
  return { answeredMessageIds: [...answeredMessageIds], status: "done" }
}

async function runWithBusyRetries(
  run: AgentRun,
  prepared: PreparedRun,
  route: AnswerRoute,
  extraInputs: AgentRunInput[],
  setActive: (handle: AgentRunHandle | undefined) => void,
  setBuffering: (value: boolean) => void,
  signal?: AbortSignal,
): Promise<RunAgentResult> {
  const earlierCalls: ModelCall[] = []

  for (let attempt = 0; attempt <= BUSY_RETRY_MS.length; attempt += 1) {
    const tried = await runOnce(
      run,
      prepared,
      route,
      extraInputs,
      setActive,
      setBuffering,
      undefined,
      signal,
    )
    if (!shouldRetryBusy(tried.result, tried.wroteText))
      return withEarlierCalls(tried.result, earlierCalls)

    earlierCalls.push(...tried.result.calls)
    const delay = BUSY_RETRY_MS[attempt]
    if (delay === undefined) break
    console.warn(
      `[agent-worker] model busy for run ${run.id}; retrying in ${delay} ms`,
    )
    setBuffering(true)
    await sleep(delay)
  }

  if (config.modelFallback) {
    console.warn(
      `[agent-worker] model busy for run ${run.id}; trying fallback ${config.modelFallback}`,
    )
    setBuffering(true)
    const tried = await runOnce(
      run,
      prepared,
      route,
      extraInputs,
      setActive,
      setBuffering,
      config.modelFallback,
      signal,
    )
    return withEarlierCalls(tried.result, earlierCalls)
  }

  return {
    messages: [],
    replies: [],
    calls: earlierCalls,
    tokensIn: sumCalls(earlierCalls).tokensIn,
    tokensOut: sumCalls(earlierCalls).tokensOut,
    costMicros: sumCalls(earlierCalls).costMicros,
    stopReason: "error",
    error: "The model provider is rate limited or overloaded.",
  }
}

async function runOnce(
  run: AgentRun,
  prepared: PreparedRun,
  route: AnswerRoute,
  extraInputs: AgentRunInput[],
  setActive: (handle: AgentRunHandle | undefined) => void,
  setBuffering: (value: boolean) => void,
  modelId?: string,
  signal?: AbortSignal,
): Promise<{ result: RunAgentResult; wroteText: boolean }> {
  let wroteText = false
  const live = createLivePublisher(run.projectId)
  const toolSeqs = new Map<string, number>()
  const stepWrites: Promise<unknown>[] = []
  const lastStep = await prisma.agentStep.aggregate({
    where: { runId: run.id },
    _max: { seq: true },
  })
  const transcript = savedTranscript(run)
  const redactor = createRedactor(
    await secretRedactions(run.projectId, prepared.requestedById, signal),
  )
  const abort = new AbortController()
  let timedOut = false
  const abortForLeaseLoss = () => abort.abort()
  const timeout = setTimeout(() => {
    timedOut = true
    abort.abort()
  }, ENV_CONFIG.AGENT_RUN_TIMEOUT_MS)
  signal?.addEventListener("abort", abortForLeaseLoss, { once: true })
  const handle = runAgent({
    config,
    runId: run.id,
    model: route.model,
    ...(modelId && { modelId }),
    thinking: route.thinking,
    system: route.system,
    ...(transcript
      ? { messages: transcript }
      : { history: prepared.context.history }),
    prompt: prepared.context.prompt,
    tools:
      route.kind === "question"
        ? []
        : buildAgentTools({ run, prepared, toolSeqs, redactor }),
    maxTurns: ENV_CONFIG.AGENT_MAX_TURNS,
    maxTokens: ENV_CONFIG.AGENT_MAX_TOKENS,
    maxCostMicros: ENV_CONFIG.AGENT_RUN_COST_LIMIT_MICROS || undefined,
    signal: abort.signal,
    toolSeqs,
    initialToolSeq: lastStep._max.seq ?? 0,
    onToolStep: (step) => {
      stepWrites.push(
        prisma.agentStep
          .upsert({
            where: { runId_seq: { runId: run.id, seq: step.seq } },
            create: {
              runId: run.id,
              seq: step.seq,
              tool: step.tool,
              input: JSON.parse(
                JSON.stringify(step.input ?? null),
              ) as Prisma.InputJsonValue,
              outputSummary: step.outputSummary,
              durationMs: step.durationMs,
            },
            update: {
              tool: step.tool,
              input: JSON.parse(
                JSON.stringify(step.input ?? null),
              ) as Prisma.InputJsonValue,
              outputSummary: step.outputSummary,
              durationMs: step.durationMs,
            },
          })
          .catch((error) =>
            console.error(
              "[agent-worker] could not save agent step:",
              run.id,
              step.seq,
              error,
            ),
          ),
      )
    },
    onEvent: (event) => {
      if (event.type === "text.delta" && event.text.length > 0) wroteText = true
      live.publish(event)
    },
  })
  setActive(handle)
  setBuffering(false)
  for (const input of extraInputs) handle.steer(input.content)
  try {
    const raw = await handle.done
    const result = timedOut
      ? {
          ...raw,
          stopReason: "aborted",
          error: "The run reached its time limit.",
        }
      : raw
    await Promise.allSettled(stepWrites)
    live.flush()
    return { result, wroteText }
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", abortForLeaseLoss)
    setActive(undefined)
    await Promise.allSettled(stepWrites)
    live.flush()
  }
}

function routeFor(
  system: string,
  sort: SortResult,
  projectMode: PreparedRun["projectMode"],
): AnswerRoute {
  if (sort.kind === "question") {
    return {
      kind: sort.kind,
      model: "fast",
      thinking: "off",
      system: `${system}\n\nThis request is a question about the project. Answer directly from the given context. Do not propose file changes or claim to edit files.`,
    }
  }
  if (sort.kind === "build") {
    return {
      kind: sort.kind,
      model: sort.model,
      thinking: sort.thinking,
      system: `${system}\n\nThis request is a broad build. A plan card may already have been shown to the person. Use tools to inspect and change the project incrementally: report progress, make focused edits, run checks, and ask the person if a product choice is ambiguous. Before your final answer, run a relevant check (build, type-check, lint or test) when the project exposes one, and read dev-server logs if preview errors matter.`,
    }
  }
  return {
    kind: sort.kind,
    model: sort.model,
    thinking: sort.thinking,
    system: `${system}\n\nYou can use tools to read, search, edit and run the project. ${projectMode === "PLAN" ? "This project is in PLAN mode: explain intended changes before making broad edits, and ask when scope is unclear. " : ""}Prefer exact file edits over whole-file rewrites. After changing code, run a targeted check when one is available. Do not say work is done unless the tool results support it.`,
  }
}

async function planIfNeeded(
  run: AgentRun,
  prepared: PreparedRun,
  route: AnswerRoute,
  calls: ModelCall[],
): Promise<string | undefined> {
  if (route.kind === "question") return undefined
  const needsPlan = route.kind === "build" || prepared.projectMode === "PLAN"
  if (!needsPlan || (await hasPlan(run.id))) return undefined

  const plan = await createPlan(run, prepared)
  calls.push(...plan.calls)
  await saveTask(run, plan.text)
  route.system = withPlan(route.system, plan.text)

  if (prepared.projectMode !== "PLAN") return undefined
  return saveQuestion(
    run,
    "Reply yes when you want me to build this plan, or tell me what to change.",
  )
}

async function hasPlan(runId: string): Promise<boolean> {
  return (await planText(runId)) !== undefined
}

async function planText(runId: string): Promise<string | undefined> {
  return (
    await prisma.chatMessage.findFirst({
      where: { runId, role: "AGENT", kind: "TASK" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { content: true },
    })
  )?.content
}

function withPlan(system: string, plan: string): string {
  return `${system}\n\nImplementation plan already shown to the person:\n${plan}\n\nUse this plan as the guide unless the person changed it.`
}

async function createPlan(
  run: AgentRun,
  prepared: PreparedRun,
): Promise<{ text: string; calls: ModelCall[] }> {
  const result = await runAgent({
    config,
    runId: `plan-${run.id}`,
    model: "code",
    thinking: prepared.projectMode === "PLAN" ? "medium" : "low",
    system: `${prepared.context.system}\n\nWrite a concise implementation plan for the person's request. Return plain text only. Use short checklist lines, mention the checks you will run, and ask no questions unless the work cannot safely be planned.`,
    history: prepared.context.history,
    prompt: prepared.context.prompt,
    maxTurns: 1,
  }).done
  const text = result.replies.at(-1)?.text.trim()
  return {
    text:
      text ||
      `Plan:\n- Inspect the relevant files.\n- Make the smallest safe changes for: ${prepared.message}\n- Run a targeted check before reporting back.`,
    calls: result.calls,
  }
}

function callList(call: ModelCall | undefined): ModelCall[] {
  return call ? [call] : []
}

function createLivePublisher(projectId: string): {
  publish: (event: AgentEvent) => void
  flush: () => void
} {
  const buffered = new Map<string, AgentEvent>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const schedule = () => {
    timer ??= setTimeout(flush, STREAM_FLUSH_MS)
  }

  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    for (const event of buffered.values()) publishAgentEvent(projectId, event)
    buffered.clear()
  }

  const bufferDelta = (
    key: string,
    event: Extract<AgentEvent, { type: "text.delta" | "thinking.delta" }>,
  ) => {
    const previous = buffered.get(key)
    if (previous?.type === event.type) {
      buffered.set(key, { ...event, text: previous.text + event.text })
    } else {
      buffered.set(key, event)
    }
    schedule()
  }

  return {
    publish: (event) => {
      if (event.type === "text.delta") {
        bufferDelta(`text:${event.runId}:${event.messageId}`, event)
        return
      }
      if (event.type === "thinking.delta") {
        bufferDelta(`thinking:${event.runId}:${event.thinkingId}`, event)
        return
      }
      flush()
      publishAgentEvent(projectId, event)
    },
    flush,
  }
}

function shouldRetryBusy(result: RunAgentResult, wroteText: boolean): boolean {
  if (wroteText || result.replies.length > 0 || result.stopReason !== "error")
    return false
  // Retrying a later model failure must never execute completed tools a second time.
  if (result.messages.some((message) => message.role === "toolResult"))
    return false
  return /429|rate.?limit|too many requests|overloaded|temporar(?:y|ily)|try again|busy/i.test(
    result.error ?? "",
  )
}

function withEarlierCalls(
  result: RunAgentResult,
  earlierCalls: ModelCall[],
): RunAgentResult {
  if (earlierCalls.length === 0) return result
  const calls = [...earlierCalls, ...result.calls]
  return { ...result, calls, ...sumCalls(calls) }
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function attachedUserMessages(
  runId: string,
  firstMessageId: string,
  after: Date,
): Promise<AgentRunInput[]> {
  const rows = await prisma.chatMessage.findMany({
    where: {
      runId,
      role: "USER",
      id: { not: firstMessageId },
      createdAt: { gte: after },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })
  return rows.map((row) => ({
    type: "user.message",
    runId,
    messageId: row.id,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  }))
}

function savedTranscript(run: AgentRun): AgentMessage[] | undefined {
  return Array.isArray(run.transcript)
    ? (run.transcript as unknown as AgentMessage[])
    : undefined
}

async function waitingQuestionId(runId: string): Promise<string | undefined> {
  const row = await prisma.chatMessage.findFirst({
    where: { runId, role: "AGENT", kind: { in: ["QUESTION", "PERMISSION"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, createdAt: true },
  })
  if (!row) return undefined
  const replies = await prisma.chatMessage.count({
    where: { runId, role: "USER", createdAt: { gt: row.createdAt } },
  })
  return replies > 0 ? undefined : row.id
}

// Saves the question that pauses this run until a user's reply resumes it.
async function saveQuestion(run: AgentRun, question: string): Promise<string> {
  const row = await prisma.chatMessage.create({
    data: {
      projectId: run.projectId,
      role: "AGENT",
      kind: "QUESTION",
      content: question,
      runId: run.id,
    },
  })
  publishChatMessage({
    id: row.id,
    projectId: row.projectId,
    role: row.role,
    kind: row.kind,
    content: row.content,
    payload: null,
    author: null,
    runId: row.runId,
    createdAt: row.createdAt,
  })
  return row.id
}

async function saveTask(run: AgentRun, content: string): Promise<string> {
  const row = await prisma.chatMessage.create({
    data: {
      projectId: run.projectId,
      role: "AGENT",
      kind: "TASK",
      content,
      runId: run.id,
    },
  })
  publishChatMessage({
    id: row.id,
    projectId: row.projectId,
    role: row.role,
    kind: row.kind,
    content: row.content,
    payload: null,
    author: null,
    runId: row.runId,
    createdAt: row.createdAt,
  })
  return row.id
}

// Saves one reply as the agent's chat message and tells every tab (it replaces the live copy).
async function saveReply(
  run: AgentRun,
  messageId: string,
  text: string,
): Promise<void> {
  const row = await prisma.chatMessage.create({
    data: {
      id: messageId,
      projectId: run.projectId,
      role: "AGENT",
      kind: "TEXT",
      content: text,
      runId: run.id,
    },
  })
  publishChatMessage({
    id: row.id,
    projectId: row.projectId,
    role: row.role,
    kind: row.kind,
    content: row.content,
    payload: null,
    author: null,
    runId: row.runId,
    createdAt: row.createdAt,
  })
}

// One UsageEvent per model call (I2), for the Usage page and budgets (I14).
async function recordUsage(
  run: AgentRun,
  workspaceId: string,
  calls: ModelCall[],
): Promise<void> {
  if (calls.length === 0) return
  await prisma.usageEvent.createMany({
    data: calls.map((call) => ({
      workspaceId,
      projectId: run.projectId,
      runId: run.id,
      kind: "LLM_TOKENS" as const,
      model: call.model,
      tokensIn: call.tokensIn,
      tokensOut: call.tokensOut,
      costMicros: call.costMicros,
    })),
  })
}

// What people read when the model didn't finish properly.
function stopMessage(result: RunAgentResult): string {
  switch (result.stopReason) {
    case "length":
      return "The answer was cut off because it got too long. Ask for something shorter, or split the request."
    case "max_turns":
      return "The agent stopped after too many steps. Ask again to continue."
    case "max_tokens":
      return "The agent stopped because this run reached its token limit. Ask again to continue from here."
    case "max_cost":
      return "The agent stopped because this run reached its cost limit. Ask again to continue from here."
    case "aborted":
      return result.error === "The run reached its time limit."
        ? "The agent stopped because this run took too long. Ask again to continue from here."
        : "The run was stopped."
    default: {
      // The provider's reason helps ("rate limit", "overloaded"), kept short.
      const detail = result.error
        ? ` (${result.error.replace(/\s+/g, " ").slice(0, 160)})`
        : ""
      return `The model couldn't answer right now${detail}. Try again in a moment.`
    }
  }
}
