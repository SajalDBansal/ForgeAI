"use client"

import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { useIdempotencyKey } from "@/hooks/use-idempotency-key"
import { isInProgress } from "@/lib/api-client"
import { commitProjectRequest } from "@/lib/build"
import {
  ModalShell,
  btnGhost,
  btnPrimary,
} from "@/components/modal/modal-shell"

// Dialog that asks for a commit message and commits (and pushes) the current source.
// Opened from the History tab's "Commit" button.
export function CommitDialog({
  projectId,
  onClose,
}: {
  projectId: string
  onClose: () => void
}) {
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const idempotency = useIdempotencyKey()

  // Sends the commit request and closes on success.
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!message.trim() || busy) return

    setBusy(true)
    const result = await commitProjectRequest(
      projectId,
      message.trim(),
      idempotency.key(message.trim()),
    )
    setBusy(false)

    if (!result.ok) {
      if (!isInProgress(result)) toast.error(result.message)
      return
    }

    idempotency.renew()
    // The new row arrives via `commit.created` on the socket, so nothing is added here.
    toast.success("Committed and pushed to GitHub")
    onClose()
  }

  return (
    <ModalShell
      title="Commit this version"
      subtitle="Saves a permanent copy of your source that you can come back to. Your work is already being saved automatically — this is for marking a point worth returning to."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button
            type="submit"
            form="commit-form"
            disabled={!message.trim() || busy}
            className={`${btnPrimary} disabled:opacity-50`}
          >
            {busy ? "Committing…" : "Commit"}
          </button>
        </>
      }
    >
      <form id="commit-form" onSubmit={submit}>
        <label className="block">
          <div className="text-mute mb-1.5 text-[11px] tracking-widest uppercase">
            What changed
          </div>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            autoFocus
            required
            maxLength={500}
            placeholder="Add the sign-up form"
            className="bg-canvas border-hairline focus:border-ink h-10 w-full rounded-sm border px-3 text-sm focus:outline-none"
          />
        </label>
      </form>
    </ModalShell>
  )
}
