"use client"

import { Play, Square } from "lucide-react"

import type { DevServerState } from "@/lib/types"
import type { DevServer } from "@/hooks/use-dev-server"
import { useOpenProject } from "@/lib/project-store"
import { useUserName } from "@/hooks/use-user-name"
import { DevServerDialog } from "@/components/builder/dev-server-dialog"

/** Status tag per state: filled dot when running, hollow when not (matches the terminal). */
const STATUS: Record<DevServerState, { label: string; className: string }> = {
  stopped: { label: "○ stopped", className: "text-mute" },
  starting: { label: "○ starting…", className: "text-mute" },
  live: { label: "● live", className: "text-ink" },
  error: { label: "● error", className: "text-danger" },
  crashed: { label: "● crashed", className: "text-danger" },
}

// Dev server status tag plus Start/Stop, shown at the end of the work tab bar.
// Hovering the tag shows who started it and why it failed, if it did.
export function DevServerControl({
  dev,
  disabled,
  canWrite,
}: {
  dev: DevServer
  disabled: boolean
  canWrite: boolean
}) {
  const project = useOpenProject()
  const nameFor = useUserName()

  const status = STATUS[dev.state]
  const running = dev.state === "live" || dev.state === "starting"

  const starter = nameFor(dev.startedBy)
  const attribution = starter ? `Started by ${starter}` : null

  return (
    <>
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span
          className={`text-[11px] ${status.className}`}
          title={
            [attribution, dev.message].filter(Boolean).join(" — ") || undefined
          }
        >
          {status.label}
        </span>

        {/* Hidden (not disabled) for viewers, who can't start it. */}
        {canWrite &&
          (running ? (
            <button
              type="button"
              onClick={dev.stop}
              className="border-hairline hover:bg-surface-soft inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-[11px] font-medium"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={dev.openDialog}
              disabled={disabled}
              title={disabled ? "Waiting for the sandbox" : undefined}
              className="border-hairline hover:bg-surface-soft inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-[11px] font-medium disabled:opacity-50"
            >
              <Play className="h-3 w-3" />
              Dev server
            </button>
          ))}
      </div>

      {/* Rendered once here; the Preview tab can open it too via useDevServer. */}
      {dev.dialogOpen && (
        <DevServerDialog
          projectId={project.id}
          canWrite={canWrite}
          onStart={dev.start}
          onClose={dev.closeDialog}
        />
      )}
    </>
  )
}
