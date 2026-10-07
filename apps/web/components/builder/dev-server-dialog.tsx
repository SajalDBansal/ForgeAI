"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"

import type { ProjectEvent } from "@forgeAI/shared"

import type { DevCommandSettings } from "@/lib/types"
import {
  getDevCommandRequest,
  resetDevCommandRequest,
  setDevCommandRequest,
} from "@/lib/sandbox"
import { useProjectSocket } from "@/hooks/use-project-socket"
import {
  ModalShell,
  btnGhost,
  btnPrimary,
} from "@/components/modal/modal-shell"

// Extracts a port from a command (`--port 3000`, `-p 3000`, `:3000`) when recognisable.
// Only used to warn about a mismatch, never to block starting.
function portInCommand(command: string): number | undefined {
  const match = command.match(/(?:--port[= ]|-p[= ]|:)(\d{2,5})\b/)
  const port = match ? Number(match[1]) : NaN
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined
}

// Notice that a collaborator saved a different command while this dialog was being edited.
// Lets the user take theirs or keep their own edit.
function SupersededNotice({
  settings,
  onAccept,
  onKeepMine,
}: {
  settings: DevCommandSettings
  onAccept: () => void
  onKeepMine: () => void
}) {
  return (
    <div className="bg-surface-soft border-hairline rounded-sm border px-3 py-2 text-xs">
      <p className="text-body">
        {settings.changedBy?.name ?? "Someone"} changed this to{" "}
        <span className="font-mono break-all">{settings.devCommand}</span> on
        port <span className="font-mono">{settings.devPort}</span> while you
        were editing.
      </p>
      <div className="mt-1.5 flex gap-3">
        <button
          type="button"
          onClick={onAccept}
          className="hover:text-ink underline"
        >
          Use theirs
        </button>
        <button
          type="button"
          onClick={onKeepMine}
          className="hover:text-ink underline"
        >
          Keep mine
        </button>
      </div>
    </div>
  )
}

// The Start dialog: shows (and lets editors change) the shared dev command and port, then starts it.
// Shown on every Start, since a collaborator may have changed the command since last time.
export function DevServerDialog({
  projectId,
  canWrite,
  onStart,
  onClose,
}: {
  projectId: string
  /** Viewers get read-only fields (they shouldn't reach this dialog at all). */
  canWrite: boolean
  onStart: (command: string, port: number, installCommand?: string) => void
  onClose: () => void
}) {
  const socket = useProjectSocket()
  const [settings, setSettings] = useState<DevCommandSettings | null>(null)
  const [command, setCommand] = useState("")
  const [port, setPort] = useState("")
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** A collaborator's newer settings, offered because the fields were already edited here. */
  const [superseded, setSuperseded] = useState<DevCommandSettings | null>(null)

  // Puts a settings object into the form fields.
  const applySettings = useCallback((next: DevCommandSettings) => {
    setSettings(next)
    setCommand(next.devCommand)
    setPort(String(next.devPort))
  }, [])

  // Read fresh on open so it reflects collaborators' changes.
  useEffect(() => {
    let current = true
    void (async () => {
      const result = await getDevCommandRequest(projectId)
      if (!current) return
      if (!result.ok) {
        setLoadError(result.message)
        return
      }
      applySettings(result.data)
    })()
    return () => {
      current = false
    }
  }, [projectId, applySettings])

  // Follow collaborators' saves: apply them if untouched here, otherwise offer them.
  useEffect(() => {
    if (!socket) return

    const onProjectEvent = (event: ProjectEvent) => {
      if (event.type !== "devCommand.updated" || event.projectId !== projectId)
        return

      // Read from the closure, not a state updater (updaters may run twice).
      const untouched =
        !settings ||
        (command.trim() === settings.devCommand &&
          Number(port) === settings.devPort)

      if (untouched) {
        applySettings(event.settings)
        setSuperseded(null)
        return
      }

      setSuperseded(event.settings)
    }

    socket.on("project:event", onProjectEvent)
    return () => {
      socket.off("project:event", onProjectEvent)
    }
  }, [socket, projectId, settings, command, port, applySettings])

  const parsedPort = Number(port)
  const portValid =
    Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535
  const canSubmit =
    !!settings && command.trim().length > 0 && portValid && !busy

  const edited =
    !!settings &&
    (command.trim() !== settings.devCommand || parsedPort !== settings.devPort)
  const commandPort = portInCommand(command)
  const mismatch =
    portValid && commandPort !== undefined && commandPort !== parsedPort

  // Saves an edited command (for everyone) and then starts the dev server with it.
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !settings) return

    setBusy(true)
    // Save first so what runs is what's recorded for collaborators.
    if (edited && canWrite) {
      const saved = await setDevCommandRequest(projectId, {
        command: command.trim(),
        port: parsedPort,
      })
      if (!saved.ok) {
        setBusy(false)
        toast.error(saved.message)
        return
      }
    }

    onStart(command.trim(), parsedPort, settings.installCommand ?? undefined)
    setBusy(false)
    onClose()
  }

  // Takes the collaborator's saved version, discarding the local edit.
  const acceptTheirs = () => {
    if (!superseded) return
    applySettings(superseded)
    setSuperseded(null)
  }

  // Resets the command back to the template's default.
  const reset = async () => {
    if (!settings || busy) return
    setBusy(true)
    const result = await resetDevCommandRequest(projectId)
    setBusy(false)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    applySettings(result.data)
    toast.success("Back to the template's command")
  }

  return (
    <ModalShell
      title="Start dev server"
      subtitle="This is what will run inside the sandbox. Edit it if your project starts differently — what you save is used for everyone."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button
            type="submit"
            form="dev-server-form"
            disabled={!canSubmit}
            className={`${btnPrimary} disabled:opacity-50`}
          >
            {busy ? "Starting…" : "Start"}
          </button>
        </>
      }
    >
      {loadError ? (
        <p className="text-body text-sm">{loadError}</p>
      ) : !settings ? (
        <p className="text-mute text-sm">Loading…</p>
      ) : (
        <form id="dev-server-form" onSubmit={submit} className="space-y-4">
          <label className="block">
            <div className="text-mute mb-1.5 text-[11px] tracking-widest uppercase">
              Command
            </div>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              autoFocus
              required
              readOnly={!canWrite}
              spellCheck={false}
              placeholder="npm run dev"
              className="bg-canvas border-hairline focus:border-ink read-only:text-mute h-10 w-full rounded-sm border px-3 font-mono text-[13px] focus:outline-none"
            />
          </label>

          <label className="block">
            <div className="text-mute mb-1.5 text-[11px] tracking-widest uppercase">
              Port
            </div>
            <input
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/[^\d]/g, ""))}
              required
              inputMode="numeric"
              readOnly={!canWrite}
              placeholder="3000"
              className="bg-canvas border-hairline focus:border-ink read-only:text-mute h-10 w-32 rounded-sm border px-3 font-mono text-[13px] focus:outline-none"
            />
            <p className="text-mute mt-1.5 text-xs">
              The port your server listens on. The preview watches this one.
            </p>
          </label>

          {superseded && (
            <SupersededNotice
              settings={superseded}
              onAccept={acceptTheirs}
              onKeepMine={() => setSuperseded(null)}
            />
          )}

          {/* A warning only: the port may be set in a way the check can't read. */}
          {mismatch && (
            <p className="text-body bg-surface-soft border-hairline rounded-sm border px-3 py-2 text-xs">
              Your command mentions port{" "}
              <span className="font-mono">{commandPort}</span> but the preview
              is set to watch <span className="font-mono">{parsedPort}</span>.
              If that is deliberate, carry on.
            </p>
          )}

          <div className="text-mute flex items-center justify-between gap-3 pt-1 text-xs">
            <span>
              {settings.isOverride
                ? `Last changed by ${settings.changedBy?.name ?? "someone who has since left"}`
                : "Using the template's command"}
            </span>
            {settings.isOverride && canWrite && (
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className="hover:text-ink underline disabled:opacity-50"
              >
                Reset to template default
              </button>
            )}
          </div>
        </form>
      )}
    </ModalShell>
  )
}
