"use client"

import { useState } from "react"
import { AlertTriangle, Copy, GitCommit, RotateCcw } from "lucide-react"

import type { Message } from "@/lib/types"
import { INITIAL_COMMITS, type Commit } from "@/lib/builder-data"
import { displayToast } from "@/lib/toast"

export function HistoryTab({ messages }: { messages: Message[] }) {
  const [commits, setCommits] = useState<Commit[]>(INITIAL_COMMITS)
  const [selected, setSelected] = useState<string>("")
  const active = commits.find((c) => c.id === selected) ?? commits[0] ?? null

  const rollback = (c: Commit) => {
    if (c.current) return
    setCommits((prev) => prev.map((x) => ({ ...x, current: x.id === c.id })))
    setSelected(c.id)
    displayToast(`Rolled back to ${c.hash}`)
  }

  const userPrompts = messages.filter((m) => m.role === "user" && m.kind === "text").length

  return (
    <div className="flex-1 flex min-h-0 bg-canvas">
      <aside className="w-full md:w-[380px] shrink-0 md:hairline-r flex flex-col min-w-0">
        <div className="hairline-b px-4 py-2.5 text-[11px] text-mute flex items-center gap-2">
          <GitCommit className="h-3 w-3" /> [ commits · {commits.length} ]{" "}
          <span className="ml-auto">{userPrompts} prompts this session</span>
        </div>
        <ul className="flex-1 overflow-y-auto divide-y divide-hairline">
          {commits.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-body">No commits yet.</li>
          )}
          {commits.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setSelected(c.id)}
                className={`w-full text-left px-4 py-3 hover:bg-surface-soft ${selected === c.id ? "bg-surface-soft" : ""}`}
              >
                <div className="flex items-center gap-2 text-[11px] text-mute font-mono">
                  <span>{c.hash}</span>
                  <span>·</span>
                  <span>{c.author}</span>
                  <span className="ml-auto">{c.time}</span>
                </div>
                <div className="mt-1 text-sm text-ink truncate">{c.prompt}</div>
                <div className="mt-1 text-[11px] text-mute flex items-center gap-2">
                  <span>{c.files} files</span>
                  <span className="text-success">+{c.additions}</span>
                  <span className="text-danger">−{c.deletions}</span>
                  {c.current && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-ink text-on-primary rounded-sm">HEAD</span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="hidden md:flex flex-1 flex-col min-w-0 bg-surface-soft">
        {!active ? (
          <div className="flex-1 grid place-items-center px-6 text-center">
            <p className="text-sm text-body">Select a commit to see what changed.</p>
          </div>
        ) : (
        <>
        <div className="hairline-b px-4 py-2.5 bg-canvas flex items-center gap-2">
          <span className="text-[11px] text-mute">[ commit ]</span>
          <span className="font-mono text-sm">{active.hash}</span>
          <span className="text-[11px] text-mute">
            by {active.author} · {active.time}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => displayToast(`Copied ${active.hash}`)}
              className="h-7 px-2 text-[11px] text-mute hover:text-ink border border-hairline rounded-sm"
            >
              <Copy className="h-3 w-3 inline mr-1" /> Copy hash
            </button>
            <button
              onClick={() => rollback(active)}
              disabled={active.current}
              className="h-7 px-2.5 text-[11px] bg-ink text-on-primary rounded-sm flex items-center gap-1.5 disabled:bg-surface-card disabled:text-ash"
            >
              <RotateCcw className="h-3 w-3" /> {active.current ? "Current HEAD" : "Rollback to this commit"}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="border border-hairline rounded-sm bg-canvas p-4">
              <div className="text-[11px] text-mute mb-1">[ prompt ]</div>
              <p className="text-sm text-ink">{active.prompt}</p>
            </div>

            <div className="border border-hairline rounded-sm bg-canvas">
              <div className="hairline-b px-3 py-2 text-[11px] text-mute flex items-center">
                <span>[ diff summary ]</span>
                <span className="ml-auto font-mono">
                  <span className="text-success">+{active.additions}</span>{" "}
                  <span className="text-danger">−{active.deletions}</span>
                </span>
              </div>
              <ul className="p-3 font-mono text-[12.5px] space-y-1">
                <li className="text-mute">{active.files} files changed</li>
              </ul>
            </div>

            {!active.current && (
              <div className="border border-warning/40 bg-warning/10 px-3 py-2 rounded-sm text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <span>
                  Rolling back will restore project files to this commit. Newer commits stay in
                  history and can be re-applied.
                </span>
              </div>
            )}
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  )
}
