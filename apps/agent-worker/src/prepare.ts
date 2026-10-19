// Everything a run starts with (work plan I5b, design in 10 §4.2): the sandbox open, the knowledge
// graph up to date and searched, and the context built (I4a). The model comes in I6.

import {
  agentConfigFromEnv,
  buildContext,
  summarizeHistory,
  type BuiltContext,
  type ContextChatMessage,
  type ContextInput,
  type ModelCall,
} from "@forgeAI/agent"
import { prisma, type AgentRun } from "@forgeAI/database"
import {
  chatMessagePayloadSchema,
  ignoredFolderKind,
  projectInfoSchema,
  type ProjectInfoData,
} from "@forgeAI/shared"

import { ENV_CONFIG } from "./envConfig.js"
import { AGENT_RUN_ACCESS_REVOKED_MESSAGE } from "./access-policy.js"
import { createRedactor, type Redactor } from "./guardrails.js"
import {
  openSandbox,
  orchestrator,
  refreshKnowledge,
  RunStop,
  searchKnowledge,
  secretRedactions,
  type RagUsageCall,
} from "./services.js"

/** Earlier chat loaded per run, newest first, before the context builder trims it (I4a's window is ≤ 12 exchanges). */
const CHAT_LOAD_LIMIT = 200

/** A file tree bigger than this is cut; the context builder collapses large folders anyway. */
const MAX_TREE_FILES = 3_000

export interface PreparedRun {
  context: BuiltContext
  /** The first user message this run answers. */
  messageId: string
  messageCreatedAt: Date
  /** The message the run answers, as typed. */
  message: string
  /** The actor whose project write access authorizes this run. */
  requestedById: string
  /** Whose usage this is (UsageEvent rows, I14). */
  workspaceId: string
  /** Project mode controls whether a broad plan waits for approval. */
  projectMode: "BUILD" | "PLAN"
  /** Model calls made while preparing (the chat summary), for UsageEvent rows. */
  calls: ModelCall[]
}

// Prepares one run. Throws RunStop for anything people should be told (no sandbox); everything else
// that's only nice to have (the graph, NOTES.md, the file tree) degrades instead of failing the run.
export async function prepareRun(
  run: AgentRun,
  signal?: AbortSignal,
): Promise<PreparedRun> {
  stopIfAborted(signal)
  const project = await prisma.project.findUnique({
    where: { id: run.projectId },
    include: {
      template: true,
      info: true,
      chatSummary: true,
    },
  })
  if (!project) throw new RunStop("This project no longer exists.")

  stopIfAborted(signal)
  const asked = await messageToAnswer(run)
  if (!asked) throw new RunStop("The message for this run couldn't be found.")
  if (!run.requestedById) throw new RunStop(AGENT_RUN_ACCESS_REVOKED_MESSAGE)
  const redactor = createRedactor(
    await secretRedactions(project.id, run.requestedById, signal),
  )
  const message = redactor.text(asked.content)

  // 1. The sandbox, opened as the person who asked.
  const pod = await openSandbox(project.id, run.requestedById, signal)

  // 2. The knowledge graph: up to date, then searched with the message as typed (Q7, part 1).
  stopIfAborted(signal)
  const knowledge = await refreshKnowledge(project.id, run.id, signal)
  await recordRagUsage(project.workspaceId, project.id, run.id, knowledge.usage)
  const related = knowledge.searchable
    ? redacted(
        await searchKnowledge(project.id, run.id, message, signal),
        redactor,
      )
    : undefined

  // 3. The rest of the context, gathered in parallel.
  stopIfAborted(signal)
  const [files, notes, chat] = await Promise.all([
    walkFiles(project.id),
    orchestrator
      .readFile(project.id, ".forgeai/NOTES.md")
      .then((text) => redacted(text, redactor))
      .catch(() => undefined),
    chatSince(
      project.id,
      run.id,
      project.chatSummary?.throughCreatedAt,
      redactor,
    ),
  ])

  const input: ContextInput = {
    project: {
      name: project.name,
      description: project.description,
      stack: project.stack,
      template: project.template
        ? { name: project.template.name, version: project.template.version }
        : null,
      devCommand: project.devCommand ?? project.template?.devCommand,
      devPort: project.devPort ?? project.template?.devPort,
      info: parseInfo(project.info?.data),
    },
    files,
    notes,
    chat: chat.messages,
    chatSummary: project.chatSummary?.text,
    related,
    now: { devServer: { state: pod.dev.state, url: pod.dev.previewUrl } },
    message: { text: message, authorName: asked.author?.name },
  }
  let context = buildContext(input)
  const calls: ModelCall[] = []

  // 4. Too much earlier chat: fold the oldest into the saved summary (fast model), then rebuild.
  if (context.unsummarized.length > 0 && context.foldCount > 0) {
    const folded = await summarizeHistory(
      agentConfigFromEnv(process.env),
      project.chatSummary?.text,
      context.unsummarized,
    )
    if (folded.call) calls.push(folded.call)
    const through = chat.rows[context.foldCount - 1]
    if (folded.folded > 0 && through) {
      await prisma.projectChatSummary.upsert({
        where: { projectId: project.id },
        create: {
          projectId: project.id,
          text: folded.summary,
          throughMessageId: through.id,
          throughCreatedAt: through.createdAt,
        },
        update: {
          text: folded.summary,
          throughMessageId: through.id,
          throughCreatedAt: through.createdAt,
        },
      })
      context = buildContext({
        ...input,
        chatSummary: folded.summary,
        chat: chat.messages.slice(context.foldCount),
      })
    }
  }

  console.log(
    `[agent-worker] run ${run.id} prepared:`,
    JSON.stringify(context.tokens),
    context.cuts.length ? `cuts: ${context.cuts.join("; ")}` : "",
  )
  return {
    context,
    messageId: asked.id,
    messageCreatedAt: asked.createdAt,
    message,
    requestedById: run.requestedById,
    workspaceId: project.workspaceId,
    projectMode: project.mode,
    calls,
  }
}

function stopIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new RunStop("The run was stopped.")
}

async function messageToAnswer(run: AgentRun) {
  const waiting = run.status === "WAITING_INPUT"
  if (waiting || run.transcript) {
    const prompt = await prisma.chatMessage.findFirst({
      where: {
        runId: run.id,
        role: "AGENT",
        kind: { in: ["QUESTION", "PERMISSION"] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    })
    if (prompt) {
      const answer = await prisma.chatMessage.findFirst({
        where: {
          runId: run.id,
          role: "USER",
          createdAt: { gt: prompt.createdAt },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { author: { select: { name: true } } },
      })
      if (answer) return answer
    }
  }

  return prisma.chatMessage.findFirst({
    where: { runId: run.id, role: "USER" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { author: { select: { name: true } } },
  })
}

// The project's file paths, walked two levels per listing, skipping ignored folders. Best effort:
// stops at MAX_TREE_CALLS listings or MAX_TREE_FILES files, and returns what it has on any failure.
async function walkFiles(projectId: string): Promise<string[]> {
  const files: string[] = []
  const queue: (string | undefined)[] = [undefined] // undefined = the project root
  const listed = new Set<string>()
  let calls = 0
  try {
    while (
      queue.length &&
      calls < ENV_CONFIG.MAX_TREE_CALLS &&
      files.length < MAX_TREE_FILES
    ) {
      const folder = queue.shift()
      calls += 1
      const listing = await orchestrator.listFiles(projectId, folder, 2)
      if (!listing) continue
      for (const entry of listing.files) {
        if (
          entry.hidden ||
          entry.path
            .split("/")
            .some(
              (part) =>
                ignoredFolderKind(part) !== undefined || part === ".forgeai",
            )
        )
          continue
        if (!entry.isDirectory) {
          files.push(entry.path)
          continue
        }
        // A listing covers two levels: folders at the second level need their own listing.
        const depth =
          entry.path.split("/").length - (folder ? folder.split("/").length : 0)
        if (depth >= 2 && !listed.has(entry.path)) {
          listed.add(entry.path)
          queue.push(entry.path)
        }
      }
    }
  } catch (error) {
    console.error("[agent-worker] file tree incomplete:", projectId, error)
  }
  return [...new Set(files)]
}

// The chat since the saved summary, oldest first, without this run's own messages.
async function chatSince(
  projectId: string,
  runId: string,
  after: Date | undefined,
  redactor: Redactor,
) {
  const rows = (
    await prisma.chatMessage.findMany({
      where: {
        projectId,
        ...(after && { createdAt: { gt: after } }),
        OR: [{ runId: null }, { runId: { not: runId } }],
      },
      orderBy: { createdAt: "desc" },
      take: CHAT_LOAD_LIMIT,
      include: { author: { select: { name: true } } },
    })
  ).reverse()
  const messages: ContextChatMessage[] = rows.map((row) => {
    const payload =
      row.payload === null
        ? null
        : chatMessagePayloadSchema.safeParse(row.payload)
    return {
      role: row.role,
      kind: row.kind,
      content: redactor.text(row.content),
      payload: payload?.success ? payload.data : null,
      authorName: row.author?.name,
    }
  })
  return { rows, messages }
}

function redacted(
  text: string | undefined,
  redactor: Redactor,
): string | undefined {
  return text === undefined ? undefined : redactor.text(text)
}

async function recordRagUsage(
  workspaceId: string,
  projectId: string,
  runId: string,
  calls: RagUsageCall[],
): Promise<void> {
  if (calls.length === 0) return
  await prisma.usageEvent.createMany({
    data: calls.map((call) => ({
      workspaceId,
      projectId,
      runId,
      kind: call.kind,
      model: call.model,
      tokensIn: call.tokensIn,
      tokensOut: call.tokensOut,
      costMicros: call.costMicros,
    })),
  })
}

// The project's Info document, or null when it's missing or malformed.
function parseInfo(data: unknown): ProjectInfoData | null {
  const parsed = projectInfoSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}
