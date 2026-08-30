"use client"

import { useState } from "react"
import { ExternalLink, GitPullRequest } from "lucide-react"

import type { Message } from "@/lib/types"
import { displayToast } from "@/lib/toast"

export function PrPromptCard({ m }: { m: Message }) {
  const [state, setState] = useState<"pending" | "generated" | "skipped">("pending")
  const [prNumber] = useState(() => Math.floor(Math.random() * 400) + 100)

  if (state === "generated") {
    return (
      <div className="border border-success/50 bg-success/10 rounded-sm px-3 py-2.5 flex items-start gap-2.5">
        <div className="h-6 w-6 shrink-0 grid place-items-center bg-success/20 text-ink rounded-sm mt-0.5">
          <GitPullRequest className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Pull request opened</div>
          <button
            onClick={() => displayToast(`Opened ${m.repoPath}#${prNumber} (mock)`)}
            className="mt-0.5 text-xs text-mute hover:text-ink flex items-center gap-1 truncate"
          >
            {m.repoPath}#{prNumber} · {m.prBranch} → main <ExternalLink className="h-3 w-3 shrink-0" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-hairline rounded-sm px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <div className="h-6 w-6 shrink-0 grid place-items-center bg-surface-card text-ink rounded-sm mt-0.5">
          <GitPullRequest className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Task complete — open a pull request?</div>
          <p className="mt-0.5 text-xs text-mute">
            Changes are committed on <span className="font-mono">{m.prBranch}</span> in{" "}
            <span className="font-mono">{m.repoPath}</span>. Nothing is pushed to the default branch until you
            generate a PR.
          </p>
        </div>
      </div>
      {state === "pending" && (
        <div className="mt-2.5 flex items-center gap-1.5 justify-end">
          <button
            onClick={() => setState("skipped")}
            className="text-xs px-2.5 py-1 border border-hairline-strong rounded-sm hover:bg-surface-soft"
          >
            Not now
          </button>
          <button
            onClick={() => {
              setState("generated")
              displayToast(`Opened pull request #${prNumber} (mock)`)
            }}
            className="text-xs px-2.5 py-1 bg-ink text-on-primary rounded-sm flex items-center gap-1.5"
          >
            <GitPullRequest className="h-3 w-3" /> Generate PR
          </button>
        </div>
      )}
      {state === "skipped" && (
        <div className="mt-2 text-[11px] text-mute">
          Skipped — <span className="font-mono">{m.prBranch}</span> is still there. You can open the PR later from
          the GitHub menu.
        </div>
      )}
    </div>
  )
}
