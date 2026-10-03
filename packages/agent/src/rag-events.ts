// Turns what the knowledge graph service sends (apps/rag-service, work plan Q4) into the agent's live
// events (Q6), so the worker (I5) only has to pass lines through: each NDJSON line from /index
// becomes one `index.status`, and a /search result becomes one `search.done`.

import type { AgentEvent, AgentSearchHit } from "@forgeAI/shared"

/** One line of the RAG service's /index stream. */
export type RagIndexLine =
  | {
      type: "progress"
      phase: string
      done: number | null
      total: number | null
    }
  | {
      type: "done"
      state: "indexed" | "up_to_date"
      etag?: string | null
      report?: Record<string, unknown>
    }
  | { type: "failed"; error: string }

/** One hit of the RAG service's /search answer. */
export interface RagSearchHit {
  kind: "code" | "doc" | "summary"
  path: string
  name?: string | null
  startLine?: number
  endLine?: number
}

/** The most hits sent to the tabs; the agent's context has them all. */
const MAX_HITS_SHOWN = 20

// A number from the index report, or 0 when it's missing.
function count(
  report: Record<string, unknown> | undefined,
  key: string,
): number {
  const value = report?.[key]
  return typeof value === "number" ? value : 0
}

// One /index line as an `index.status` event.
export function indexEventFromRag(
  runId: string,
  line: RagIndexLine,
): AgentEvent {
  if (line.type === "failed")
    return { type: "index.status", runId, state: "failed", error: line.error }

  if (line.type === "done") {
    if (line.state === "up_to_date")
      return { type: "index.status", runId, state: "up_to_date" }
    return {
      type: "index.status",
      runId,
      state: "done",
      counts: {
        filesChanged: count(line.report, "files_changed"),
        blocksEmbedded:
          count(line.report, "blocks_embedded") +
          count(line.report, "doc_chunks_embedded"),
        blocksReused:
          count(line.report, "blocks_reused") +
          count(line.report, "doc_chunks_reused"),
      },
    }
  }

  if (line.phase === "checking")
    return { type: "index.status", runId, state: "checking" }
  return {
    type: "index.status",
    runId,
    state: "indexing",
    phase: line.phase,
    ...(line.done !== null && { done: line.done }),
    ...(line.total !== null && { total: line.total }),
  }
}

// A /search result as a `search.done` event, with only what the tabs show.
export function searchEventFromRag(
  runId: string,
  query: string,
  hits: RagSearchHit[],
): AgentEvent {
  const shown: AgentSearchHit[] = hits.slice(0, MAX_HITS_SHOWN).map((hit) => ({
    kind: hit.kind,
    path: hit.path,
    name: hit.name ?? null,
    ...(hit.startLine !== undefined && { startLine: hit.startLine }),
    ...(hit.endLine !== undefined && { endLine: hit.endLine }),
  }))
  return { type: "search.done", runId, query, hits: shown }
}
