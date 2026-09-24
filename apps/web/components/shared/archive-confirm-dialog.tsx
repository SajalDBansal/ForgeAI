"use client"

import {
  ModalShell,
  btnGhost,
  btnPrimary,
} from "@/components/modal/modal-shell"
import { AffectedProjects } from "@/components/shared/affected-projects"
import type { Project } from "@/lib/types"

// Confirms archiving a project or workspace, listing projects that go with it.
// Shared by the project and workspace archive actions.
export function ArchiveConfirmDialog({
  name,
  projects = [],
  onClose,
  onConfirm,
}: {
  name: string
  /** Projects that go to the archive with it — empty when archiving a project. */
  projects?: Project[]
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
      <p className="text-body text-sm">
        It will be permanently deleted after 30 days. To get it back before
        then, open the archive page from your account menu and restore it.
      </p>
      <AffectedProjects projects={projects} verb="archived" />
    </ModalShell>
  )
}
