"use client"

import { Check } from "lucide-react"

import { displayToast } from "@/lib/toast"

// Button that (mock) schedules a plan checkpoint.
// Shows a toast only.
export function ScheduleButton() {
  return (
    <button
      onClick={() => displayToast("Checkpoint scheduled (demo)")}
      className="border-hairline-strong hover:bg-surface-soft ml-auto flex items-center gap-1 rounded-sm border px-2.5 py-1 text-xs"
    >
      <Check className="h-3 w-3" /> Schedule
    </button>
  )
}
