"use client"

import { useState } from "react"
import { AlertTriangle, Check, Square, X } from "lucide-react"
import type { AgentSearchHit } from "@forgeAI/shared"

import type { LiveIndex, LiveItem, LiveRun } from "@/hooks/use-agent-live"

/** Lines of a running command's output kept on screen. */
const OUTPUT_LINES = 6

/** Found places listed before "show N more". */
const HITS_SHOWN = 6

/** How each indexing phase reads to people. */
const PHASE_LABEL: Record<string, string> = {
  downloading: "downloading",
  unpacking: "unpacking",
  scanning: "scanning files",
  parsing: "reading the code",
  embedding: "embedding",
  linking: "linking",
  summarizing: "summarizing folders",
}

// "1.2 MB", for download progress.
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// The knowledge graph's progress before the run (Q6): a line with a bar while it works, a short
// result after, or a warning if it failed (the agent carries on without it).
function IndexLine({ index }: { index: LiveIndex }) {
  if (index.state === "failed") {
    return (
      <div className="border-warning/50 bg-warning/10 text-ink flex items-start gap-2 rounded-sm border px-2.5 py-1.5 text-[12px]">
        <AlertTriangle className="text-warning mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Could not update the project knowledge
          {index.error ? `: ${index.error}` : ""}. The agent carries on without
          it.
        </span>
      </div>
    )
  }
  if (index.state === "up_to_date" || index.state === "done") {
    const counts = index.state === "done" ? index.counts : undefined
    return (
      <p className="text-mute flex items-center gap-1.5 text-[12px]">
        <Check className="text-success h-3 w-3" />
        {index.state === "up_to_date"
          ? "Project knowledge is up to date"
          : "Project knowledge updated"}
        {counts &&
          ` · ${counts.filesChanged} changed file${counts.filesChanged === 1 ? "" : "s"}, ${counts.blocksEmbedded} new, ${counts.blocksReused} reused`}
      </p>
    )
  }

  const label =
    index.state === "checking"
      ? "Checking the project's knowledge…"
      : `Indexing the project · ${PHASE_LABEL[index.phase ?? ""] ?? index.phase ?? "working"}`
  const amount =
    index.phase === "downloading" && index.done !== undefined
      ? ` ${formatBytes(index.done)}`
      : index.done !== undefined && index.total
        ? ` ${index.done}/${index.total}`
        : ""
  const percent = index.total
    ? Math.min(100, Math.round(((index.done ?? 0) / index.total) * 100))
    : null
  return (
    <div className="text-body text-[12px]">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="bg-ink pulse-dot h-1.5 w-1.5 rounded-full"
        />
        <span>
          {label}
          {amount}
        </span>
      </div>
      {percent !== null && (
        <div className="bg-surface-card mt-1 ml-3.5 h-1 overflow-hidden rounded-full">
          <div
            className="bg-ink h-full transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  )
}

// What the graph search found (Q6): the code and docs the agent was given. A file opens in the editor.
function FoundList({
  search,
  onOpenFile,
}: {
  search: { query: string; hits: AgentSearchHit[] }
  onOpenFile?: (path: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  if (search.hits.length === 0)
    return (
      <p className="text-mute text-[12px]">
        No related code or docs found for this message
      </p>
    )

  const shown = showAll ? search.hits : search.hits.slice(0, HITS_SHOWN)
  return (
    <div className="text-[12px]">
      <p className="text-body">
        Found {search.hits.length} related place
        {search.hits.length === 1 ? "" : "s"}
      </p>
      <ul className="mt-1 ml-3.5 space-y-0.5">
        {shown.map((hit, i) => {
          const where =
            hit.kind === "summary"
              ? `${hit.path || "the project"}/ (folder overview)`
              : `${hit.path}${hit.startLine ? `:${hit.startLine}` : ""}`
          const openable = hit.kind !== "summary" && onOpenFile
          return (
            <li
              key={`${hit.kind}-${hit.path}-${hit.startLine ?? i}`}
              className="flex min-w-0 items-baseline gap-2"
            >
              {openable ? (
                <button
                  onClick={() => onOpenFile(hit.path)}
                  className="text-ink truncate font-mono text-[11px] hover:underline"
                >
                  {where}
                </button>
              ) : (
                <span className="text-body truncate font-mono text-[11px]">
                  {where}
                </span>
              )}
              {hit.name && (
                <span className="text-mute truncate">{hit.name}</span>
              )}
            </li>
          )
        })}
      </ul>
      {search.hits.length > HITS_SHOWN && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-mute hover:text-ink mt-0.5 ml-3.5 text-[11px]"
        >
          {showAll
            ? "Show fewer"
            : `Show ${search.hits.length - HITS_SHOWN} more`}
        </button>
      )}
    </div>
  )
}

// The status line under a run that's still going.
function statusText(run: LiveRun): string | null {
  if (run.status === "QUEUED") return "Queued: starts when the agent is free"
  if (run.status === "WAITING_INPUT") return "Waiting for an answer above"
  if (run.status === "RUNNING")
    return run.attempt > 1 ? `Working… (try ${run.attempt})` : "Working…"
  return null
}

// "$0.0123", for the run's cost so far.
function formatCost(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`
}

// One tool call: what it does, whether it worked and how long it took; a command's last lines while it runs.
function ToolRow({ item }: { item: Extract<LiveItem, { kind: "tool" }> }) {
  const running = item.ok === undefined
  const lastLines = item.output
    .split("\n")
    .slice(-OUTPUT_LINES)
    .join("\n")
    .trimEnd()
  return (
    <div className="text-[12px]">
      <div className="text-body flex items-center gap-2">
        {running ? (
          <span
            aria-hidden
            className="bg-ink pulse-dot h-1.5 w-1.5 rounded-full"
          />
        ) : item.ok ? (
          <Check className="text-success h-3 w-3" />
        ) : (
          <X className="text-warning h-3 w-3" />
        )}
        <span className="truncate">{item.summary}</span>
        {item.durationMs !== undefined && (
          <span className="text-mute ml-auto">
            {(item.durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>
      {running && lastLines && (
        <pre className="bg-surface-soft text-mute mt-1 ml-3.5 max-h-28 overflow-hidden rounded-sm px-2 py-1 font-mono text-[11px] break-all whitespace-pre-wrap">
          {lastLines}
        </pre>
      )}
    </div>
  )
}

// What the agent is doing right now, under the saved messages (I3). Replies appear as they're
// written and give way to the saved message once it arrives. Before the run: the knowledge
// graph's progress and what it found (Q6); a found file opens with `onOpenFile`.
export function AgentLive({
  runs,
  onOpenFile,
  onCancelRun,
}: {
  runs: LiveRun[]
  onOpenFile?: (path: string) => void
  onCancelRun?: (runId: string) => void
}) {
  return (
    <>
      {runs.map((run) => {
        const status = statusText(run)
        const last = run.items[run.items.length - 1]
        if (!status && run.items.length === 0 && !run.index && !run.search)
          return null
        return (
          <div key={run.runId} className="flex gap-3">
            <div className="bg-surface-card text-ink mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-sm text-[10px] font-bold">
              F/
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              {run.index && <IndexLine index={run.index} />}
              {run.search && (
                <FoundList search={run.search} onOpenFile={onOpenFile} />
              )}
              {run.items.map((item) => {
                if (item.kind === "text") {
                  return (
                    <p
                      key={item.id}
                      className="text-body text-sm whitespace-pre-wrap"
                    >
                      {item.text}
                      <span
                        aria-hidden
                        className="bg-ink pulse-dot ml-0.5 inline-block h-3.5 w-1.5 align-middle"
                      />
                    </p>
                  )
                }
                // Reasoning only matters until the agent acts on it.
                if (item.kind === "thinking") {
                  if (item !== last) return null
                  return (
                    <p
                      key={item.id}
                      className="text-mute line-clamp-3 text-[12px] whitespace-pre-wrap italic"
                    >
                      Thinking… {item.text.slice(-300)}
                    </p>
                  )
                }
                return <ToolRow key={item.id} item={item} />
              })}
              {status && (
                <div className="text-mute flex items-center gap-2 text-[10px] leading-tight">
                  <span className="min-w-0 flex-1">
                    <span className="text-body">Agent</span>: {status}
                    {run.costMicros !== undefined &&
                      ` - ${formatCost(run.costMicros)}`}
                  </span>
                  {onCancelRun && (
                    <button
                      type="button"
                      onClick={() => onCancelRun(run.runId)}
                      className="text-mute hover:text-ink hover:bg-surface-soft grid h-6 w-6 place-items-center rounded-sm"
                      aria-label="Stop agent run"
                      title="Stop agent run"
                    >
                      <Square className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}
