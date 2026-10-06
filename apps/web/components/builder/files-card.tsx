"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, FileText, RotateCcw } from "lucide-react"

import { undoAgentRunRequest } from "@/lib/build"
import { useOpenProject } from "@/lib/project-store"
import { displayToast } from "@/lib/toast"
import type { Message } from "@/lib/types"

// Collapsible list of files the agent changed, with line counts.
// Open by default.
export function FilesCard({ m }: { m: Message }) {
  const [open, setOpen] = useState(true)
  const [undoing, setUndoing] = useState(false)
  const project = useOpenProject()
  const canUndo = Boolean(m.runId && !undoing)

  const undo = async () => {
    if (!m.runId || undoing) return
    setUndoing(true)
    const result = await undoAgentRunRequest(project.id, m.runId)
    setUndoing(false)
    displayToast(
      result.ok ? `Undid ${result.data.files} file changes` : result.message,
    )
  }

  return (
    <div className="border-hairline rounded-sm border">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="text-mute h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="text-mute h-3.5 w-3.5" />
          )}
          <FileText className="text-mute h-3.5 w-3.5" />
          <span className="text-sm font-medium">
            {m.files?.length} file changes
          </span>
          <span className="text-mute ml-auto text-[11px]">
            +{m.files?.reduce((a, f) => a + (f.additions ?? 0), 0)} · −
            {m.files?.reduce((a, f) => a + (f.deletions ?? 0), 0)}
          </span>
        </button>
        <button
          type="button"
          title="Undo this run"
          disabled={!canUndo}
          onClick={() => void undo()}
          className={`border-hairline-strong flex items-center gap-1 rounded-sm border px-2 py-1 text-xs ${
            canUndo
              ? "hover:bg-surface-card text-body"
              : "text-mute cursor-not-allowed opacity-50"
          }`}
        >
          <RotateCcw className="h-3 w-3" /> {undoing ? "Undoing..." : "Undo"}
        </button>
      </div>
      {open && (
        <ul className="hairline-t divide-hairline divide-y">
          {m.files?.map((f) => (
            <li
              key={f.path}
              className="flex items-center gap-2 px-3 py-1.5 font-mono text-[12px]"
            >
              <span className="text-mute w-3">
                {f.action === "created"
                  ? "+"
                  : f.action === "deleted"
                    ? "−"
                    : "~"}
              </span>
              <span className="truncate">{f.path}</span>
              <span className="text-mute ml-auto tabular-nums">
                {f.additions ? (
                  <span className="text-success">+{f.additions}</span>
                ) : null}
                {f.deletions ? (
                  <span className="text-danger ml-1.5">−{f.deletions}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
