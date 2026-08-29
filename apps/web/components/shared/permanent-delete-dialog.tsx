"use client"

import { ModalShell, btnGhost } from "@/components/modal/modal-shell"

export function PermanentDeleteDialog({
  name,
  onClose,
  onConfirm,
}: {
  name: string
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <ModalShell
      title="Delete permanently?"
      subtitle={`"${name}" will be deleted right away — this can't be undone.`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className="h-9 px-4 bg-danger text-on-primary rounded-sm text-sm font-medium hover:bg-danger/90 inline-flex items-center gap-2"
          >
            Delete permanently
          </button>
        </>
      }
    >
      <p className="text-sm text-body">There is no way to recover it once it is deleted.</p>
    </ModalShell>
  )
}
