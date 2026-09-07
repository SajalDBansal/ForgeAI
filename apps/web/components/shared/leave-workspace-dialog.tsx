"use client"

import { ModalShell, btnGhost } from "@/components/modal/modal-shell"

// Confirms a collaborator leaving a workspace (their alternative to archive/delete).
// Nothing in the workspace is deleted.
export function LeaveWorkspaceDialog({
  name,
  leaving = false,
  onClose,
  onConfirm,
}: {
  name: string
  leaving?: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <ModalShell
      title="Leave this workspace?"
      subtitle={`You'll be removed from "${name}".`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={leaving}
            className="bg-danger text-on-primary hover:bg-danger/90 inline-flex h-9 items-center gap-2 rounded-sm px-4 text-sm font-medium disabled:opacity-60"
          >
            {leaving ? "Leaving…" : "Leave workspace"}
          </button>
        </>
      }
    >
      <p className="text-body text-sm">
        You won&apos;t be able to open its projects or do anything in it until
        the owner adds you back. Nothing in the workspace is deleted.
      </p>
    </ModalShell>
  )
}
