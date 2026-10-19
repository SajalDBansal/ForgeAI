import { Type, type ForgeTool } from "@forgeAI/agent"
import type { AgentRun } from "@forgeAI/database"
import { prisma } from "@forgeAI/database"
import type {
  AgentDevServerResult,
  AgentExecResult,
  PodFileListing,
} from "@forgeAI/shared"

import {
  blockedCommandReason,
  commandPermission,
  guardedText,
  type Redactor,
} from "./guardrails.js"
import { consumeCommandApproval } from "./permissions.js"
import type { PreparedRun } from "./prepare.js"
import { publishChatMessage } from "./redis.js"
import { orchestrator, searchKnowledge } from "./services.js"

const TOOL_RESULT_CHARS = 20_000
const COMMAND_TIMEOUT_MS = 30_000
const MAX_COMMAND_TIMEOUT_MS = 120_000

interface ToolContext {
  run: AgentRun
  prepared: PreparedRun
  toolSeqs: Map<string, number>
  redactor: Redactor
}

function seqFor(context: ToolContext, toolCallId: string): number {
  const seq = context.toolSeqs.get(toolCallId)
  if (!seq) throw new Error("Tool step was not registered.")
  return seq
}

function textResult(
  redactor: Redactor,
  source: string,
  text: string,
  details: unknown = undefined,
  isError = false,
  terminate = false,
) {
  return {
    content: [
      {
        type: "text" as const,
        text: guardedText(redactor, source, text, TOOL_RESULT_CHARS),
      },
    ],
    details: redactor.details(details),
    ...(isError && { isError }),
    ...(terminate && { terminate }),
  }
}

function trustedTextResult(
  text: string,
  details: unknown = undefined,
  isError = false,
  terminate = false,
) {
  return {
    content: [{ type: "text" as const, text }],
    details,
    ...(isError && { isError }),
    ...(terminate && { terminate }),
  }
}

function cap(text: string, max = TOOL_RESULT_CHARS): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`
}

function errorResult(redactor: Redactor, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return textResult(
    redactor,
    "tool error",
    `Error: ${message}`,
    { error: message },
    true,
  )
}

function jsonResult(redactor: Redactor, label: string, value: unknown) {
  return textResult(
    redactor,
    label.toLowerCase().replace(/:$/, ""),
    `${label}\n${JSON.stringify(redactor.details(value), null, 2)}`,
    value,
  )
}

function numberOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function buildAgentTools(context: ToolContext): ForgeTool[] {
  const { run, redactor } = context

  return [
    {
      name: "read_file",
      label: "Read file",
      description:
        "Read a text file from the project. Use project-relative paths.",
      parameters: Type.Object({
        path: Type.String({
          minLength: 1,
          description: "Project-relative file path, for example app/page.tsx.",
        }),
      }),
      summarize: (args) => `Reading ${String(args.path ?? "file")}`,
      async execute(_toolCallId, params) {
        const p = params as { path: string }
        try {
          const content = await orchestrator.readFile(run.projectId, p.path)
          if (content === undefined)
            return textResult(
              redactor,
              "file read",
              `File not found: ${p.path}`,
              { path: p.path },
              true,
            )
          return textResult(
            redactor,
            "file content",
            `File: ${p.path}\n\n${cap(content)}`,
            { path: p.path, chars: content.length },
          )
        } catch (error) {
          return errorResult(redactor, error)
        }
      },
    },
    {
      name: "list_files",
      label: "List files",
      description: "List files and folders in the project.",
      parameters: Type.Object({
        path: Type.Optional(
          Type.String({
            minLength: 1,
            description: "Project-relative folder path. Omit for the root.",
          }),
        ),
        depth: Type.Optional(
          Type.Integer({
            minimum: 1,
            maximum: 2,
            description: "How many levels to list. Maximum 2.",
          }),
        ),
      }),
      summarize: (args) => `Listing ${String(args.path ?? "project files")}`,
      async execute(_toolCallId, params) {
        const p = params as { path?: string; depth?: 1 | 2 }
        try {
          const listing = await orchestrator.listFiles(
            run.projectId,
            p.path,
            p.depth ?? 2,
          )
          if (!listing)
            return textResult(
              redactor,
              "file listing",
              `Folder not found: ${p.path ?? "."}`,
              p,
              true,
            )
          return jsonResult(redactor, "Files:", summarizeListing(listing))
        } catch (error) {
          return errorResult(redactor, error)
        }
      },
    },
    {
      name: "search_code",
      label: "Search code",
      description: "Search the current files literally with ripgrep.",
      parameters: Type.Object({
        query: Type.String({
          minLength: 1,
          description: "Literal text to search for.",
        }),
        maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
      }),
      summarize: (args) => `Searching code for ${String(args.query ?? "")}`,
      async execute(_toolCallId, params) {
        const p = params as { query: string; maxResults?: number }
        try {
          return jsonResult(
            redactor,
            "Code search results:",
            await orchestrator.search(
              run.projectId,
              p.query,
              p.maxResults ?? 50,
            ),
          )
        } catch (error) {
          return errorResult(redactor, error)
        }
      },
    },
    {
      name: "search_project",
      label: "Search project graph",
      description: "Semantic search over the project's indexed code and docs.",
      parameters: Type.Object({
        query: Type.String({
          minLength: 1,
          description: "Natural-language search query.",
        }),
      }),
      summarize: (args) =>
        `Searching project graph for ${String(args.query ?? "")}`,
      async execute(_toolCallId, params) {
        const p = params as { query: string }
        const found = await searchKnowledge(run.projectId, run.id, p.query)
        if (!found)
          return textResult(
            redactor,
            "project graph results",
            "The project graph had no result, or is not configured.",
            { query: p.query },
          )
        return textResult(
          redactor,
          "project graph results",
          `Project graph results:\n\n${cap(found)}`,
          { query: p.query },
        )
      },
    },
    {
      name: "write_file",
      label: "Write file",
      description:
        "Replace a whole text file. Use only when a targeted edit is not enough.",
      parameters: Type.Object({
        path: Type.String({ minLength: 1 }),
        content: Type.String(),
      }),
      executionMode: "sequential",
      summarize: (args) => `Writing ${String(args.path ?? "file")}`,
      async execute(toolCallId, params) {
        const p = params as { path: string; content: string }
        try {
          const result = await orchestrator.editFile(run.projectId, {
            runId: run.id,
            seq: seqFor(context, toolCallId),
            path: p.path,
            content: p.content,
          })
          return jsonResult(
            redactor,
            result.changed
              ? `Wrote ${p.path}.`
              : `${p.path} was already unchanged.`,
            result,
          )
        } catch (error) {
          return errorResult(redactor, error)
        }
      },
    },
    {
      name: "edit_file",
      label: "Edit file",
      description: "Replace one exact string in a text file.",
      parameters: Type.Object({
        path: Type.String({ minLength: 1 }),
        search: Type.String({
          minLength: 1,
          description: "Exact text to replace.",
        }),
        replace: Type.String({ description: "Replacement text." }),
      }),
      executionMode: "sequential",
      summarize: (args) => `Editing ${String(args.path ?? "file")}`,
      async execute(toolCallId, params) {
        const p = params as { path: string; search: string; replace: string }
        try {
          const result = await orchestrator.editFile(run.projectId, {
            runId: run.id,
            seq: seqFor(context, toolCallId),
            path: p.path,
            search: p.search,
            replace: p.replace,
          })
          return jsonResult(
            redactor,
            result.changed
              ? `Edited ${p.path}.`
              : `${p.path} was already unchanged.`,
            result,
          )
        } catch (error) {
          return errorResult(redactor, error)
        }
      },
    },
    {
      name: "run_command",
      label: "Run command",
      description: "Run a non-interactive command in the project sandbox.",
      parameters: Type.Object({
        command: Type.String({ minLength: 1 }),
        cwd: Type.Optional(
          Type.String({
            minLength: 1,
            description: "Project-relative working directory.",
          }),
        ),
        timeoutMs: Type.Optional(
          Type.Integer({ minimum: 1_000, maximum: MAX_COMMAND_TIMEOUT_MS }),
        ),
      }),
      executionMode: "sequential",
      summarize: (args) => `Running ${String(args.command ?? "command")}`,
      async execute(toolCallId, params, signal) {
        const p = params as {
          command: string
          cwd?: string
          timeoutMs?: number
        }
        try {
          const refusal = await authorizeCommand(run, p.command, p.cwd)
          if (refusal) return refusal
          const result = await orchestrator.exec(run.projectId, {
            runId: run.id,
            seq: seqFor(context, toolCallId),
            command: p.command,
            ...(p.cwd && { cwd: p.cwd }),
            timeoutMs: numberOr(p.timeoutMs, COMMAND_TIMEOUT_MS),
          })
          return commandResult(redactor, result)
        } catch (error) {
          if (signal?.aborted)
            return textResult(
              redactor,
              "command output",
              "Command was cancelled.",
              { aborted: true },
              true,
            )
          return errorResult(redactor, error)
        }
      },
    },
    {
      name: "start_dev_server",
      label: "Start dev server",
      description: "Start the shared project dev server for preview.",
      parameters: Type.Object({
        command: Type.String({ minLength: 1 }),
        port: Type.Integer({ minimum: 1, maximum: 65_535 }),
        installCommand: Type.Optional(Type.String({ minLength: 1 })),
      }),
      executionMode: "sequential",
      summarize: () => "Starting dev server",
      async execute(toolCallId, params) {
        const p = params as {
          command: string
          port: number
          installCommand?: string
        }
        try {
          // Starting a preview executes shell commands and uses the same permission gate.
          const commands = [p.installCommand, p.command].filter(
            (command): command is string => Boolean(command),
          )
          const refusal = await authorizeCommand(run, commands.join(" && "))
          if (refusal) return refusal
          const result = await orchestrator.startDevServer(run.projectId, {
            runId: run.id,
            seq: seqFor(context, toolCallId),
            command: p.command,
            port: p.port,
            ...(p.installCommand && { installCommand: p.installCommand }),
          })
          return devResult(redactor, "Dev server start requested.", result)
        } catch (error) {
          return errorResult(redactor, error)
        }
      },
    },
    {
      name: "stop_dev_server",
      label: "Stop dev server",
      description: "Stop the shared project dev server.",
      parameters: Type.Object({}),
      executionMode: "sequential",
      summarize: () => "Stopping dev server",
      async execute(toolCallId) {
        try {
          const result = await orchestrator.stopDevServer(run.projectId, {
            runId: run.id,
            seq: seqFor(context, toolCallId),
          })
          return devResult(redactor, "Dev server stopped.", result)
        } catch (error) {
          return errorResult(redactor, error)
        }
      },
    },
    {
      name: "read_dev_logs",
      label: "Read dev logs",
      description: "Read the shared dev server status and recent log tail.",
      parameters: Type.Object({}),
      summarize: () => "Reading dev logs",
      async execute() {
        try {
          return devResult(
            redactor,
            "Dev server logs:",
            await orchestrator.readDevLogs(run.projectId),
          )
        } catch (error) {
          return errorResult(redactor, error)
        }
      },
    },
    {
      name: "ask_user",
      label: "Ask user",
      description:
        "Ask the person a clarifying question when continuing would require guessing.",
      parameters: Type.Object({
        question: Type.String({ minLength: 1 }),
      }),
      executionMode: "sequential",
      summarize: () => "Asking a question",
      async execute(_toolCallId, params) {
        const p = params as { question: string }
        const row = await prisma.chatMessage.create({
          data: {
            projectId: run.projectId,
            role: "AGENT",
            kind: "QUESTION",
            content: p.question,
            runId: run.id,
          },
        })
        publishChatMessage({ ...row, payload: null, author: null })
        return trustedTextResult(
          "Question saved for the person. Stop now and wait for their answer.",
          { question: p.question },
          false,
          true,
        )
      },
    },
    {
      name: "report_progress",
      label: "Report progress",
      description: "Show a short progress update in the Agent tab.",
      parameters: Type.Object({
        message: Type.String({ minLength: 1 }),
      }),
      summarize: () => "Reporting progress",
      async execute(_toolCallId, params) {
        const p = params as { message: string }
        const row = await prisma.chatMessage.create({
          data: {
            projectId: run.projectId,
            role: "AGENT",
            kind: "TASK",
            content: p.message,
            runId: run.id,
          },
        })
        publishChatMessage({ ...row, payload: null, author: null })
        return trustedTextResult("Progress update saved.", {
          message: p.message,
        })
      },
    },
  ]
}

function summarizeListing(listing: PodFileListing) {
  return {
    files: listing.files.map((file) => ({
      path: file.path,
      type: file.isDirectory ? "folder" : "file",
      size: file.size,
      ...(file.hidden && { hidden: file.hidden }),
    })),
    truncated: listing.truncated,
  }
}

async function authorizeCommand(run: AgentRun, command: string, cwd?: string) {
  const blocked = blockedCommandReason(command)
  if (blocked) return trustedTextResult(blocked, { command }, true)
  const permission = commandPermission(command, cwd)
  if (!permission || (await consumeCommandApproval(run.id, permission.key)))
    return undefined
  const row = await savePermission(
    run,
    permission.title,
    permission.detail,
    permission.key,
  )
  return trustedTextResult(
    "Permission saved for the person. Stop now and wait for their answer.",
    { waitingOnMessageId: row.id },
    false,
    true,
  )
}

async function savePermission(
  run: AgentRun,
  title: string,
  detail: string,
  key: string,
) {
  const payload = { permissionTitle: title, permissionDetail: detail }
  const row = await prisma.chatMessage.create({
    data: {
      projectId: run.projectId,
      role: "AGENT",
      kind: "PERMISSION",
      content: `${title}\n\n${detail}\n\nReply yes to allow it, or tell me what to do instead.`,
      payload: { ...payload, approvalKey: key },
      runId: run.id,
    },
  })
  publishChatMessage({ ...row, payload, author: null })
  return row
}

function commandResult(redactor: Redactor, result: AgentExecResult) {
  const text = [
    `Exit code: ${result.exitCode}${result.timedOut ? " (timed out)" : ""}`,
    result.stdout && `stdout:\n${cap(result.stdout)}`,
    result.stderr && `stderr:\n${cap(result.stderr)}`,
  ]
    .filter(Boolean)
    .join("\n\n")
  return textResult(
    redactor,
    "command output",
    text || "Command finished with no output.",
    result,
    result.exitCode !== 0,
  )
}

function devResult(
  redactor: Redactor,
  prefix: string,
  result: AgentDevServerResult,
) {
  const text = [
    prefix,
    `State: ${result.state}`,
    result.previewUrl && "Preview: available in the Preview tab.",
    result.message && `Message: ${result.message}`,
    result.logs && `Logs:\n${cap(result.logs)}`,
  ]
    .filter(Boolean)
    .join("\n")
  return textResult(
    redactor,
    "dev server output",
    text,
    result,
    result.state === "error" || result.state === "crashed",
  )
}
