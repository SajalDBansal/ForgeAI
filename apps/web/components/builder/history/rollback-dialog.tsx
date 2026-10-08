"use client"

import { useState } from "react"
import { RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { useIdempotencyKey } from "@/hooks/use-idempotency-key"
import { isInProgress } from "@/lib/api-client"
import { rollbackCommitRequest, type Commit } from "@/lib/build"
import {
  ModalShell,
  btnGhost,
  btnPrimary,
} from "@/components/modal/modal-shell"

// Owner's confirmation before restoring a commit's files.
// The rollback is saved as a new commit, so later history is kept.
export function RollbackDialog({
  projectId,
  commit,
  onClose,
}: {
  projectId: string
  commit: Commit
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const idempotency = useIdempotencyKey()

  // Sends the rollback request and closes on success.
  const confirm = async () => {
    setBusy(true)
    const result = await rollbackCommitRequest(
      projectId,
      commit.id,
      idempotency.key(commit.id),
    )
    setBusy(false)
    if (!result.ok) {
      if (!isInProgress(result)) toast.error(result.message)
      return
    }
    idempotency.renew()
    // The new commit arrives through `commit.created` on the socket, like any other.
    toast.success(`Rolled back to ${commit.hash.slice(0, 7)}`)
    onClose()
  }

  return (
    <ModalShell
      title="Roll back to this commit?"
      subtitle={`The project's files go back to how they were at "${commit.prompt}". This is saved as a new commit — everything after it stays in History, and you can roll forward again.`}
      width="max-w-md"
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={busy}
            className={`${btnGhost} disabled:opacity-50`}
          >
            Cancel
          </button>
          <button
            onClick={() => void confirm()}
            disabled={busy}
            className={`${btnPrimary} disabled:opacity-60`}
          >
            <RotateCcw className="h-4 w-4" />{" "}
            {busy ? "Rolling back…" : "Roll back"}
          </button>
        </>
      }
    >
      <ul className="text-body list-disc space-y-1.5 pl-5 text-sm">
        <li>Everyone on the project sees the files change.</li>
        <li>Installed packages are kept — no reinstall needed.</li>
        <li>The rollback is a new commit, pushed to GitHub like any other.</li>
        <li>Changes nobody committed are replaced too.</li>
      </ul>
    </ModalShell>
  )
}
