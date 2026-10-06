"use client"

import { RotateCw, TriangleAlert } from "lucide-react"

import type { SandboxLifecycle } from "@/hooks/use-sandbox-lifecycle"

// Formats a future time as "in about N minutes".
// Deliberately approximate, since nothing is counting down on screen.
function minutesAway(at: Date): string {
  const minutes = Math.max(1, Math.round((at.getTime() - Date.now()) / 60_000))
  return minutes === 1 ? "in about a minute" : `in about ${minutes} minutes`
}

// Banner warning that the idle sandbox will shut down soon, or that it has.
// Work is saved either way; after a shutdown it offers to start the sandbox again.
export function SandboxNotice({
  lifecycle,
  onReopen,
}: {
  lifecycle: SandboxLifecycle
  onReopen: () => void
}) {
  if (lifecycle.reaped) {
    return (
      <div className="hairline-b bg-surface-soft flex items-center gap-2 px-4 py-2 text-xs">
        <TriangleAlert className="text-warning h-3.5 w-3.5 shrink-0" />
        <span className="text-body">
          This project&apos;s environment was shut down after being idle. Your
          work is saved.
        </span>
        <button
          onClick={onReopen}
          className="border-hairline hover:bg-canvas ml-auto inline-flex h-7 items-center gap-1.5 rounded-sm border px-2.5 font-medium"
        >
          <RotateCw className="h-3 w-3" /> Start it again
        </button>
      </div>
    )
  }

  if (!lifecycle.reapAt) return null

  return (
    <div className="hairline-b bg-surface-soft flex items-center gap-2 px-4 py-2 text-xs">
      <TriangleAlert className="text-warning h-3.5 w-3.5 shrink-0" />
      <span className="text-body">
        This project&apos;s environment will shut down{" "}
        {minutesAway(lifecycle.reapAt)} because nothing has happened for a
        while. Your work is saved either way — do anything here to keep it
        running.
      </span>
    </div>
  )
}
