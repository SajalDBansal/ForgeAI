"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { useConnections } from "@/hooks/use-connections"

const SKIPPED_KEY = "forgeai:github-versions-skipped"

// Reads whether the user skipped the GitHub hint in this browser.
// Treats blocked storage as "not skipped".
function readSkipped(): boolean {
  try {
    return localStorage.getItem(SKIPPED_KEY) === "1"
  } catch {
    return false
  }
}

// Hint under the composer about where a new project's versions will live (GitHub).
// Nudges connecting GitHub; "Skip for now" hides it in this browser.
export function GithubVersionsHint() {
  const { connections, loading } = useConnections()
  const [skipped, setSkipped] = useState(readSkipped)

  if (loading) return null
  const github = connections.find(
    (c) => c.provider === "GITHUB" && c.status === "CONNECTED",
  )

  if (github) {
    return (
      <div className="text-mute mt-3 flex items-center gap-1.5 text-[11px]">
        <ChevronRight className="h-3 w-3" />
        ForgeAI creates a private GitHub repo under{" "}
        {github.externalAccountLogin} and pushes every commit there.
      </div>
    )
  }
  if (skipped) return null

  return (
    <div className="text-body border-hairline bg-surface-soft mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border px-3 py-2 text-[11px]">
      <span>
        Connect GitHub to keep versions of your projects — commits, history and
        rollback live there.
      </span>
      <Link
        href="/connections"
        className="text-ink font-medium underline underline-offset-2"
      >
        Connect GitHub
      </Link>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(SKIPPED_KEY, "1")
          } catch {
            // Storage blocked: it just shows again next time.
          }
          setSkipped(true)
        }}
        className="text-mute hover:text-ink"
      >
        Skip for now
      </button>
    </div>
  )
}
