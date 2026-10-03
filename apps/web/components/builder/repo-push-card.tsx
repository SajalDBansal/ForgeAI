"use client"

import { CheckCircle2 } from "lucide-react"

import type { Message } from "@/lib/types"
import { GithubIcon } from "@/components/brand/github-icon"
import { displayToast } from "@/lib/toast"

// Chat card announcing a repo creation or push to GitHub.
// The repo link is a mock toast.
export function RepoPushCard({ m }: { m: Message }) {
  return (
    <div className="border-hairline flex items-start gap-2.5 rounded-sm border px-3 py-2.5">
      <div className="bg-ink text-on-primary mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-sm">
        <GithubIcon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {m.initial ? "Created repository" : "Pushed to GitHub"}
          <CheckCircle2 className="text-success h-3.5 w-3.5" />
        </div>
        <button
          onClick={() => displayToast(`Opened ${m.repoPath} (mock)`)}
          className="text-mute hover:text-ink mt-0.5 block truncate font-mono text-xs"
        >
          {m.repoPath}@main · {m.commitHash} · {m.fileCount} file
          {m.fileCount === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  )
}
