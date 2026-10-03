"use client"

import { useState } from "react"
import { ExternalLink, GitPullRequest } from "lucide-react"

import type { Message } from "@/lib/types"
import { displayToast } from "@/lib/toast"

// Asks whether to open a pull request for the agent's branch.
// Mock: "Generate PR" only shows a fake PR number.
export function PrPromptCard({ m }: { m: Message }) {
  const [state, setState] = useState<"pending" | "generated" | "skipped">(
    "pending",
  )
  const [prNumber] = useState(() => Math.floor(Math.random() * 400) + 100)

  if (state === "generated") {
    return (
      <div className="border-success/50 bg-success/10 flex items-start gap-2.5 rounded-sm border px-3 py-2.5">
        <div className="bg-success/20 text-ink mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-sm">
          <GitPullRequest className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Pull request opened</div>
          <button
            onClick={() =>
              displayToast(`Opened ${m.repoPath}#${prNumber} (mock)`)
            }
            className="text-mute hover:text-ink mt-0.5 flex items-center gap-1 truncate text-xs"
          >
            {m.repoPath}#{prNumber} · {m.prBranch} → main{" "}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-hairline rounded-sm border px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <div className="bg-surface-card text-ink mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-sm">
          <GitPullRequest className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            Task complete — open a pull request?
          </div>
          <p className="text-mute mt-0.5 text-xs">
            Changes are committed on{" "}
            <span className="font-mono">{m.prBranch}</span> in{" "}
            <span className="font-mono">{m.repoPath}</span>. Nothing is pushed
            to the default branch until you generate a PR.
          </p>
        </div>
      </div>
      {state === "pending" && (
        <div className="mt-2.5 flex items-center justify-end gap-1.5">
          <button
            onClick={() => setState("skipped")}
            className="border-hairline-strong hover:bg-surface-soft rounded-sm border px-2.5 py-1 text-xs"
          >
            Not now
          </button>
          <button
            onClick={() => {
              setState("generated")
              displayToast(`Opened pull request #${prNumber} (mock)`)
            }}
            className="bg-ink text-on-primary flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs"
          >
            <GitPullRequest className="h-3 w-3" /> Generate PR
          </button>
        </div>
      )}
      {state === "skipped" && (
        <div className="text-mute mt-2 text-[11px]">
          Skipped — <span className="font-mono">{m.prBranch}</span> is still
          there. You can open the PR later from the GitHub menu.
        </div>
      )}
    </div>
  )
}
