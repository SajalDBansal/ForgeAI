"use client"

import { Check } from "lucide-react"

import { displayToast } from "@/lib/toast"

export function ScheduleButton() {
  return (
    <button
      onClick={() => displayToast("Checkpoint scheduled (demo)")}
      className="ml-auto text-xs px-2.5 py-1 border border-hairline-strong rounded-sm hover:bg-surface-soft flex items-center gap-1"
    >
      <Check className="h-3 w-3" /> Schedule
    </button>
  )
}
