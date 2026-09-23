"use client"

import { useState, type FormEvent } from "react"

import {
  ModalShell,
  btnGhost,
  btnPrimary,
} from "@/components/modal/modal-shell"
import { useWorkspaceActions } from "@/hooks/use-workspace-actions"

// Dialog that creates a workspace by name.
// Calls `onCreated` with the new id once the server confirms.
export function NewWorkspaceDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated?: (id: string) => void
}) {
  const { create } = useWorkspaceActions()
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  // Creates the workspace and closes the dialog on success.
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || saving) return

    setSaving(true)
    const workspace = await create(trimmed)
    setSaving(false)
    if (!workspace) return

    onCreated?.(workspace.id)
    onClose()
  }

  return (
    <ModalShell
      title="New workspace"
      subtitle="Group related projects and collaborators together."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button
            type="submit"
            form="new-workspace-form"
            disabled={saving}
            className={`${btnPrimary} disabled:opacity-50`}
          >
            {saving ? "Creating…" : "Create workspace"}
          </button>
        </>
      }
    >
      <form id="new-workspace-form" onSubmit={submit}>
        <label className="block">
          <div className="text-mute mb-1.5 text-[11px] tracking-widest uppercase">
            Name
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
            placeholder="Acme Corp"
            className="bg-canvas border-hairline focus:border-ink h-10 w-full rounded-sm border px-3 text-sm focus:outline-none"
          />
        </label>
      </form>
    </ModalShell>
  )
}
