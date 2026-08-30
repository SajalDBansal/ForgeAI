"use client"

import { CheckCircle2 } from "lucide-react"

import type { Message } from "@/lib/types"
import { GithubIcon } from "@/components/brand/github-icon"
import { displayToast } from "@/lib/toast"

export function RepoPushCard({ m }: { m: Message }) {
  return (
    <div className="border border-hairline rounded-sm px-3 py-2.5 flex items-start gap-2.5">
      <div className="h-6 w-6 shrink-0 grid place-items-center bg-ink text-on-primary rounded-sm mt-0.5">
        <GithubIcon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {m.initial ? "Created repository" : "Pushed to GitHub"}
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        </div>
        <button
          onClick={() => displayToast(`Opened ${m.repoPath} (mock)`)}
          className="mt-0.5 text-xs text-mute hover:text-ink font-mono truncate block"
        >
          {m.repoPath}@main · {m.commitHash} · {m.fileCount} file{m.fileCount === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  )
}
