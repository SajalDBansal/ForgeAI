"use client"

import { ModalShell, btnGhost } from "@/components/modal/modal-shell"
import { AffectedProjects } from "@/components/shared/affected-projects"
import type { Project } from "@/lib/types"

// Confirms permanently deleting a project or workspace, listing what goes with it.
// Used from the archive page and owner menus.
export function PermanentDeleteDialog({
  name,
  projects = [],
  onClose,
  onConfirm,
}: {
  name: string
  /** Projects deleted along with it — empty when deleting a project. */
  projects?: Project[]
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
            className="bg-danger text-on-primary hover:bg-danger/90 inline-flex h-9 items-center gap-2 rounded-sm px-4 text-sm font-medium"
          >
            Delete permanently
          </button>
        </>
      }
    >
      <p className="text-body text-sm">
        There is no way to recover it once it is deleted.
      </p>
      <AffectedProjects projects={projects} verb="deleted permanently" />
    </ModalShell>
  )
}
