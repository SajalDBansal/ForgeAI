"use client"

import { useState, type FormEvent } from "react"

import { ModalShell, btnGhost, btnPrimary } from "@/components/modal/modal-shell"
import { useAppStore } from "@/lib/store"
import { displayToast } from "@/lib/toast"

export function NewWorkspaceDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated?: (id: string) => void
}) {
  const createWorkspace = useAppStore((s) => s.createWorkspace)
  const [name, setName] = useState("")

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const workspace = createWorkspace(trimmed)
    displayToast(`Created workspace "${workspace.name}"`)
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
          <button type="submit" form="new-workspace-form" className={btnPrimary}>
            Create workspace
          </button>
        </>
      }
    >
      <form id="new-workspace-form" onSubmit={submit}>
        <label className="block">
          <div className="text-[11px] uppercase tracking-widest text-mute mb-1.5">Name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
            placeholder="Acme Corp"
            className="w-full h-10 bg-canvas border border-hairline rounded-sm px-3 text-sm focus:outline-none focus:border-ink"
          />
        </label>
      </form>
    </ModalShell>
  )
}
