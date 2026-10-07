"use client"

import { AlertTriangle, Cloud, CloudOff, Loader2 } from "lucide-react"

import type { Backup } from "@/hooks/use-snapshot-status"

// Formats an ISO time as HH:MM.
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

// Status-bar label for the whole-project cloud save (separate from the file's own save).
// A held save is clickable for editors to reopen the confirmation dialog.
export function BackupStatus({
  backup,
  canWrite,
}: {
  backup: Backup
  canWrite: boolean
}) {
  const { status, reopen } = backup

  if (status.shrink) {
    const label = canWrite
      ? "Cloud save paused — needs your OK"
      : "Cloud save paused — waiting for an editor"
    return canWrite ? (
      <button
        onClick={reopen}
        className="text-warning flex items-center gap-1.5 hover:underline"
        title="A save would remove a large part of the project. Click to choose."
      >
        <AlertTriangle className="h-3 w-3" />
        {label}
      </button>
    ) : (
      <span className="text-warning flex items-center gap-1.5">
        <AlertTriangle className="h-3 w-3" />
        {label}
      </span>
    )
  }

  switch (status.state) {
    case "saving":
      return (
        <span className="flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving to cloud…
        </span>
      )
    case "saved":
      return (
        <span
          className="flex items-center gap-1.5"
          title="Your project is saved in cloud storage and survives the sandbox shutting down."
        >
          <Cloud className="h-3 w-3" />
          {status.savedAt
            ? `Saved to cloud ${time(status.savedAt)}`
            : "Saved to cloud"}
        </span>
      )
    case "failed":
      return (
        <span
          className="text-warning flex items-center gap-1.5"
          title={status.message}
        >
          <CloudOff className="h-3 w-3" />
          Cloud save failed — retrying
        </span>
      )
    default:
      // Nothing needed saving yet since the sandbox opened.
      return (
        <span
          className="flex items-center gap-1.5"
          title="Changes are saved to cloud storage automatically."
        >
          <Cloud className="h-3 w-3" />
          Cloud save on
        </span>
      )
  }
}
