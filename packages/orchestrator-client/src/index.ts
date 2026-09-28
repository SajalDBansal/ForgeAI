// @forgeAI/orchestrator-client: typed calls to the orchestrator, the only service that touches sandboxes
// (work plan I5b, design in 10 §4.4 and 08 §8.5). The agent worker uses it now; I7 adds the agent's tool
// endpoints, and api-server can move to it later. With several orchestrators (08 §8), the per-project
// routing goes here, so callers never change.

import type {
  AgentCheckpointDataType,
  AgentCheckpointDiffDataType,
  AgentCheckpointDiffResult,
  AgentCheckpointRestoreDataType,
  AgentCheckpointRestoreResult,
  AgentCheckpointResult,
  AgentDevServerResult,
  AgentDevStartDataType,
  AgentDevStopDataType,
  AgentEditFileDataType,
  AgentEditFileResult,
  AgentExecDataType,
  AgentExecResult,
  AgentSearchResult,
  PodFileListing,
  RagSource,
} from "@forgeAI/shared"
import { AGENT_PROJECT_LEASE_HEADER as PROJECT_LEASE_HEADER } from "@forgeAI/shared"

export interface OrchestratorClientConfig {
  /** e.g. http://localhost:3004 */
  baseUrl: string
  /** ORCHESTRATOR_TOKEN: the orchestrator refuses any request without it (audit C-1). */
  token: string
  /** Per request. Default 30 s; a save before rag-source can take a while. */
  timeoutMs?: number
  /** Optional per-project ownership fence, used by agent workers while they hold a Redis lease. */
  fence?: (
    projectId: string,
    request: { method: "GET" | "POST"; suffix: string },
  ) => { token: string; signal?: AbortSignal } | undefined
}

/** The orchestrator answered with an error, or couldn't be reached (`status` 0). */
export class OrchestratorError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "OrchestratorError"
  }
}

const SANDBOX_PATH = "/api/v1/sandbox"

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

export interface OrchestratorClient {
  /** A folder's entries, project-relative (the root when `path` is omitted). Undefined if it doesn't exist. */
  listFiles(
    projectId: string,
    path?: string,
    depth?: 1 | 2,
  ): Promise<PodFileListing | undefined>
  /** A text file's content. Undefined if it doesn't exist; throws if the orchestrator refuses it (binary, too big). */
  readFile(projectId: string, path: string): Promise<string | undefined>
  /** Saves the project if it changed and returns a short-lived link to its source, for the knowledge graph (Q5). */
  ragSource(projectId: string): Promise<RagSource>
  /** Runs a one-off, non-interactive command for an agent step. */
  exec(projectId: string, input: AgentExecDataType): Promise<AgentExecResult>
  /** Edits a file through the document service when it is open, otherwise on disk. */
  editFile(
    projectId: string,
    input: AgentEditFileDataType,
  ): Promise<AgentEditFileResult>
  /** Searches project files with ripgrep inside the sandbox. */
  search(
    projectId: string,
    query: string,
    maxResults?: number,
  ): Promise<AgentSearchResult>
  /** Creates a local-only git checkpoint for an agent run. */
  checkpoint(
    projectId: string,
    input: AgentCheckpointDataType,
  ): Promise<AgentCheckpointResult>
  /** Lists files changed since an agent checkpoint. */
  diffCheckpoint(
    projectId: string,
    input: AgentCheckpointDiffDataType,
  ): Promise<AgentCheckpointDiffResult>
  /** Restores the project files back to an agent checkpoint. */
  restoreCheckpoint(
    projectId: string,
    input: AgentCheckpointRestoreDataType,
  ): Promise<AgentCheckpointRestoreResult>
  /** Starts the shared dev server and returns its current status/log tail. */
  startDevServer(
    projectId: string,
    input: AgentDevStartDataType,
  ): Promise<AgentDevServerResult>
  /** Stops the shared dev server and returns its current status/log tail. */
  stopDevServer(
    projectId: string,
    input: AgentDevStopDataType,
  ): Promise<AgentDevServerResult>
  /** Reads the shared dev server's current status/log tail. */
  readDevLogs(projectId: string): Promise<AgentDevServerResult>
}

// Builds a client. One per process is enough; fetch pools its connections.
export function createOrchestratorClient(
  config: OrchestratorClientConfig,
): OrchestratorClient {
  const timeoutMs = config.timeoutMs ?? 30_000

  // One request; 404 comes back as undefined when `notFoundIsEmpty`, other failures throw.
  async function call<T>(
    method: "GET" | "POST",
    projectId: string,
    suffix: string,
    {
      query,
      body,
      notFoundIsEmpty = false,
    }: {
      query?: Record<string, string | undefined>
      body?: unknown
      notFoundIsEmpty?: boolean
    } = {},
  ): Promise<T | undefined> {
    const url = new URL(
      `${SANDBOX_PATH}/${encodeURIComponent(projectId)}${suffix}`,
      config.baseUrl,
    )
    for (const [key, value] of Object.entries(query ?? {}))
      if (value !== undefined) url.searchParams.set(key, value)
    const headers: Record<string, string> = {
      authorization: `Bearer ${config.token}`,
    }
    const fence = config.fence?.(projectId, { method, suffix })
    if (fence?.token) headers[PROJECT_LEASE_HEADER] = fence.token
    if (body !== undefined) headers["content-type"] = "application/json"
    if (fence?.signal?.aborted)
      throw new OrchestratorError(
        499,
        "project lease was lost before the orchestrator request",
      )

    let response: Response
    try {
      const signals = [AbortSignal.timeout(timeoutMs)]
      if (fence?.signal) signals.push(fence.signal)
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: combineSignals(signals),
      })
    } catch (error) {
      throw new OrchestratorError(
        0,
        `orchestrator unreachable: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    if (response.status === 404 && notFoundIsEmpty) {
      await response.body?.cancel()
      return undefined
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      throw new OrchestratorError(
        response.status,
        body.error ?? `orchestrator answered ${response.status}`,
      )
    }
    return (await response.json()) as T
  }

  return {
    listFiles: (projectId, path, depth = 2) =>
      call<PodFileListing>("GET", projectId, "/fs/list", {
        query: { path, depth: String(depth) },
        notFoundIsEmpty: true,
      }),
    readFile: async (projectId, path) =>
      (
        await call<{ content: string }>("GET", projectId, "/fs", {
          query: { path },
          notFoundIsEmpty: true,
        })
      )?.content,
    ragSource: async (projectId) =>
      (await call<RagSource>("POST", projectId, "/rag-source"))!,
    exec: async (projectId, input) =>
      (await call<AgentExecResult>("POST", projectId, "/exec", {
        body: input,
      }))!,
    editFile: async (projectId, input) =>
      (await call<AgentEditFileResult>("POST", projectId, "/fs/edit", {
        body: input,
      }))!,
    search: async (projectId, query, maxResults) =>
      (await call<AgentSearchResult>("GET", projectId, "/search", {
        query: {
          query,
          maxResults: maxResults === undefined ? undefined : String(maxResults),
        },
      }))!,
    checkpoint: async (projectId, input) =>
      (await call<AgentCheckpointResult>("POST", projectId, "/checkpoint", {
        body: input,
      }))!,
    diffCheckpoint: async (projectId, input) =>
      (await call<AgentCheckpointDiffResult>(
        "POST",
        projectId,
        "/diff-checkpoint",
        { body: input },
      ))!,
    restoreCheckpoint: async (projectId, input) =>
      (await call<AgentCheckpointRestoreResult>(
        "POST",
        projectId,
        "/restore-checkpoint",
        { body: input },
      ))!,
    startDevServer: async (projectId, input) =>
      (await call<AgentDevServerResult>("POST", projectId, "/dev/start", {
        body: input,
      }))!,
    stopDevServer: async (projectId, input) =>
      (await call<AgentDevServerResult>("POST", projectId, "/dev/stop", {
        body: input,
      }))!,
    readDevLogs: async (projectId) =>
      (await call<AgentDevServerResult>("GET", projectId, "/dev/logs"))!,
  }
}
