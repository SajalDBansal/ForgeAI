"use client"

import { ModalShell, btnGhost, btnPrimary } from "@/components/modal/modal-shell"

export function ArchiveConfirmDialog({
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
      title="Archive this?"
      subtitle={`"${name}" will move to the archive.`}
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
            className={btnPrimary}
          >
            Archive
          </button>
        </>
      }
    >
      <p className="text-sm text-body">
        It will be permanently deleted after 30 days. To get it back before then, open the{" "}
        archive page from your account menu and restore it.
      </p>
    </ModalShell>
  )
}
