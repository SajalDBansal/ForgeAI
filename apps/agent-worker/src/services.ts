// The services a run talks to (10 §4.4): api-server to open the sandbox, the orchestrator for every
// other sandbox call, and the knowledge graph service. All over HTTP; events go out on Redis.

import { AsyncLocalStorage } from "node:async_hooks"

import {
  indexEventFromRag,
  searchEventFromRag,
  type RagIndexLine,
  type RagSearchHit,
} from "@forgeAI/agent"
import { createOrchestratorClient } from "@forgeAI/orchestrator-client"
import type { EnsurePodResponse, RagSource, UsageKind } from "@forgeAI/shared"

import { AGENT_RUN_ACCESS_REVOKED_MESSAGE } from "./access-policy.js"
import { ENV_CONFIG } from "./envConfig.js"
import type { SecretRedaction } from "./guardrails.js"
import { publishAgentEvent } from "./redis.js"

type ProjectLeaseContext = {
  projectId: string
  token: string
  signal: AbortSignal
}

const projectLeaseContext = new AsyncLocalStorage<ProjectLeaseContext>()

function combineSignals(signals: AbortSignal[]): AbortSignal {
  const active = signals.filter((signal) => !signal.aborted)
  const aborted = signals.find((signal) => signal.aborted)
  if (aborted) return aborted
  if (active.length === 1) return active[0]!
  if (typeof AbortSignal.any === "function") return AbortSignal.any(active)

  const controller = new AbortController()
  const abort = () => controller.abort()
  for (const signal of active)
    signal.addEventListener("abort", abort, { once: true })
  return controller.signal
}

export function withProjectLease<T>(
  lease: ProjectLeaseContext,
  run: () => Promise<T>,
): Promise<T> {
  return projectLeaseContext.run(lease, run)
}

export const orchestrator = createOrchestratorClient({
  baseUrl: ENV_CONFIG.ORCHESTRATOR_URL,
  token: ENV_CONFIG.ORCHESTRATOR_TOKEN,
  // rag-source may save the project first.
  timeoutMs: 120_000,
  fence: (projectId) => {
    const lease = projectLeaseContext.getStore()
    if (!lease || lease.projectId !== projectId) return undefined
    return { token: lease.token, signal: lease.signal }
  },
})

/** A run can't go on, for a reason people should read (shown as the run's failure). */
export class RunStop extends Error {}

// ---------- api-server: open the sandbox (option A) ----------

// Opens (or reattaches to) the project's sandbox as the person who asked, through api-server's internal
// route, so the same rules as a tab apply. Throws RunStop with the reason people should see.
export async function openSandbox(
  projectId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<EnsurePodResponse> {
  let response: Response
  try {
    response = await fetch(
      `${ENV_CONFIG.INTERNAL_API_URL}/api/v1/internal/agent/projects/${encodeURIComponent(projectId)}/sandbox`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${ENV_CONFIG.INTERNAL_API_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ userId }),
        signal: combineSignals([
          AbortSignal.timeout(180_000),
          ...(signal ? [signal] : []),
        ]),
      },
    )
  } catch (error) {
    console.error("[agent-worker] api-server unreachable:", error)
    throw new RunStop(
      "The project's environment couldn't be started right now. Try again in a moment.",
    )
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    // api-server's messages are written for people (the owner limit, archived, busy…).
    throw new RunStop(
      body.error
        ? `The project's environment couldn't be started: ${body.error}`
        : "The project's environment couldn't be started.",
    )
  }
  return (await response.json()) as EnsurePodResponse
}

// The worker needs actual secret values only to scrub tool output before the model or chat sees it.
// Fail closed when values cannot be loaded; pattern matching alone cannot protect arbitrary secrets.
export async function secretRedactions(
  projectId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<SecretRedaction[]> {
  try {
    const response = await fetch(
      `${ENV_CONFIG.INTERNAL_API_URL}/api/v1/internal/agent/projects/${encodeURIComponent(projectId)}/secret-redactions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${ENV_CONFIG.INTERNAL_API_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ userId }),
        signal: combineSignals([
          AbortSignal.timeout(10_000),
          ...(signal ? [signal] : []),
        ]),
      },
    )
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (response.status === 404)
        throw new RunStop(AGENT_RUN_ACCESS_REVOKED_MESSAGE)
      throw new Error(
        body.error ?? `secret redactions answered ${response.status}`,
      )
    }
    const body = (await response.json()) as { secrets?: SecretRedaction[] }
    if (!Array.isArray(body.secrets))
      throw new Error("Invalid secret redaction response")
    return body.secrets
  } catch (error) {
    if (error instanceof RunStop) throw error
    console.error(
      "[agent-worker] could not load secret redactions:",
      projectId,
      error,
    )
    throw new RunStop(
      "The agent could not load the project's secret protection settings. Try again shortly.",
    )
  }
}

// ---------- the knowledge graph (Q7, part 1) ----------

const ragConfigured = () =>
  Boolean(ENV_CONFIG.RAG_SERVICE_URL && ENV_CONFIG.RAG_SERVICE_SECRET)

export type RagUsageCall = {
  kind: Extract<UsageKind, "LLM_TOKENS" | "EMBEDDING_TOKENS">
  model: string
  tokensIn: number
  tokensOut: number
  costMicros: number
}

const EMBEDDING_INPUT_MICROS_PER_MILLION = 20_000
const SUMMARY_INPUT_MICROS_PER_MILLION = 100_000
const SUMMARY_OUTPUT_MICROS_PER_MILLION = 400_000

function reportNumber(
  report: Record<string, unknown> | undefined,
  key: string,
): number {
  const value = report?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function costMicros(tokens: number, microsPerMillion: number): number {
  return Math.round((tokens * microsPerMillion) / 1_000_000)
}

function usageFromIndexLine(line: RagIndexLine | undefined): RagUsageCall[] {
  if (line?.type !== "done" || line.state !== "indexed") return []
  const report = line.report
  const embeddingTokens = reportNumber(report, "embedding_tokens")
  const summaryTokensIn = reportNumber(report, "summary_tokens_in")
  const summaryTokensOut = reportNumber(report, "summary_tokens_out")
  return [
    ...(embeddingTokens > 0
      ? [
          {
            kind: "EMBEDDING_TOKENS" as const,
            model: ENV_CONFIG.RAG_EMBEDDING_MODEL,
            tokensIn: embeddingTokens,
            tokensOut: 0,
            costMicros: costMicros(
              embeddingTokens,
              EMBEDDING_INPUT_MICROS_PER_MILLION,
            ),
          },
        ]
      : []),
    ...(summaryTokensIn > 0 || summaryTokensOut > 0
      ? [
          {
            kind: "LLM_TOKENS" as const,
            model: ENV_CONFIG.RAG_SUMMARY_MODEL,
            tokensIn: summaryTokensIn,
            tokensOut: summaryTokensOut,
            costMicros:
              costMicros(summaryTokensIn, SUMMARY_INPUT_MICROS_PER_MILLION) +
              costMicros(summaryTokensOut, SUMMARY_OUTPUT_MICROS_PER_MILLION),
          },
        ]
      : []),
  ]
}

// Brings the project's graph up to date, relaying every step to the tabs as `index.status`. Never
// throws and never blocks past INDEX_TIMEOUT_MS: on any failure the run carries on without the graph.
// Returns whether the graph can be searched.
export async function refreshKnowledge(
  projectId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<{ searchable: boolean; usage: RagUsageCall[] }> {
  if (!ragConfigured()) return { searchable: false, usage: [] }
  const fail = (error: string) => {
    publishAgentEvent(projectId, {
      type: "index.status",
      runId,
      state: "failed",
      error,
    })
    return { searchable: false, usage: [] }
  }

  let source: RagSource
  try {
    source = await orchestrator.ragSource(projectId)
  } catch (error) {
    console.error("[agent-worker] rag-source failed:", projectId, error)
    return fail("the project's files couldn't be saved for it")
  }

  try {
    const response = await fetch(
      `${ENV_CONFIG.RAG_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/index`,
      {
        method: "POST",
        headers: {
          "x-rag-secret": ENV_CONFIG.RAG_SERVICE_SECRET,
          "content-type": "application/json",
        },
        body: JSON.stringify({ sourceUrl: source.url, etag: source.etag }),
        signal: combineSignals([
          AbortSignal.timeout(ENV_CONFIG.INDEX_TIMEOUT_MS),
          ...(signal ? [signal] : []),
        ]),
      },
    )
    // 409: another run is indexing this project right now; its graph is good enough to search.
    if (response.status === 409) return { searchable: true, usage: [] }
    if (!response.ok || !response.body)
      return fail(`the knowledge service answered ${response.status}`)

    // NDJSON: one line per step; the last is done or failed.
    let buffer = ""
    let last: RagIndexLine | undefined
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += Buffer.from(chunk).toString("utf8")
      let newline: number
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line) continue
        last = JSON.parse(line) as RagIndexLine
        publishAgentEvent(projectId, indexEventFromRag(runId, last))
      }
    }
    return {
      searchable: last?.type === "done",
      usage: usageFromIndexLine(last),
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError"
    console.error("[agent-worker] indexing failed:", projectId, error)
    return fail(
      timedOut
        ? "it took too long; the agent carries on without it"
        : "the knowledge service couldn't be reached",
    )
  }
}

// Looks the message up in the graph and tells the tabs what was found. Returns the context block for
// the agent, or undefined when there's nothing (or the service failed: the run carries on).
export async function searchKnowledge(
  projectId: string,
  runId: string,
  query: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (!ragConfigured()) return undefined
  try {
    const response = await fetch(
      `${ENV_CONFIG.RAG_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/search`,
      {
        method: "POST",
        headers: {
          "x-rag-secret": ENV_CONFIG.RAG_SERVICE_SECRET,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query: query.slice(0, 8000) }),
        signal: combineSignals([
          AbortSignal.timeout(60_000),
          ...(signal ? [signal] : []),
        ]),
      },
    )
    if (!response.ok) throw new Error(`search answered ${response.status}`)
    const found = (await response.json()) as {
      contextText: string
      hits: RagSearchHit[]
    }
    publishAgentEvent(projectId, searchEventFromRag(runId, query, found.hits))
    return found.contextText || undefined
  } catch (error) {
    console.error("[agent-worker] search failed:", projectId, error)
    return undefined
  }
}
