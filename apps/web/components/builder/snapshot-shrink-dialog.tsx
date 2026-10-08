"use client"

import { AlertTriangle } from "lucide-react"

import type { Backup } from "@/hooks/use-snapshot-status"
import {
  ModalShell,
  btnGhost,
  btnPrimary,
} from "@/components/modal/modal-shell"

// Asks whether to save a project that lost over half its files, or bring them back.
// Only for editors/owner while a save is held; nothing is lost while it's open.
export function SnapshotShrinkDialog({
  backup,
  canWrite,
}: {
  backup: Backup
  canWrite: boolean
}) {
  const { status, asking, answering, resolve, dismiss } = backup
  if (!canWrite || !asking || !status.shrink) return null

  const { files, storedFiles } = status.shrink
  const missing = Math.max(storedFiles - files, 0)
  const failed = status.state === "failed" ? status.message : undefined

  return (
    <ModalShell
      title="Save a much smaller project?"
      subtitle="The automatic save to cloud storage is on hold until you choose."
      onClose={answering ? undefined : dismiss}
      footer={
        <>
          <button
            type="button"
            onClick={dismiss}
            disabled={answering}
            className={`${btnGhost} mr-auto disabled:opacity-50`}
          >
            Decide later
          </button>
          <button
            type="button"
            onClick={() => resolve("old")}
            disabled={answering}
            className={`${btnGhost} disabled:opacity-50`}
          >
            Bring the files back
          </button>
          <button
            type="button"
            onClick={() => resolve("new")}
            disabled={answering}
            className={`${btnPrimary} disabled:opacity-50`}
          >
            {answering ? "Saving…" : "Yes, save it"}
          </button>
        </>
      }
    >
      <div className="text-body space-y-3 text-sm">
        <div className="border-warning/40 bg-warning/10 flex gap-3 rounded-sm border p-3">
          <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" />
          <p>
            While saving, we found <strong>{files}</strong> files in this
            project. The saved copy has <strong>{storedFiles}</strong> — about{" "}
            {missing} are gone. That usually means files were deleted.
          </p>
        </div>
        <p>
          <strong>Nothing is lost while you decide.</strong> Your current work
          is kept safely on hold in cloud storage, and the saved copy is left as
          it was.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Yes, save it</strong> if you deleted those files on purpose.
            The project is saved as it is now.
          </li>
          <li>
            <strong>Bring the files back</strong> if it was a mistake. Only the
            missing files are restored — anything you have changed since is
            kept.
          </li>
        </ul>
        {failed && (
          <p className="text-warning">
            That didn&apos;t work: {failed}. You can try again.
          </p>
        )}
      </div>
    </ModalShell>
  )
}
