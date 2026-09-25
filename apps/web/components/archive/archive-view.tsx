"use client"

import { useState } from "react"
import { Archive as ArchiveIcon, FolderGit2 } from "lucide-react"

import { TopBar } from "@/components/layout/topbar"
import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { EmptyState } from "@/components/layout/empty-state"
import { PermanentDeleteDialog } from "@/components/shared/permanent-delete-dialog"
import { useIsOwner } from "@/hooks/use-is-owner"
import { useProjectActions } from "@/hooks/use-project-actions"
import { useWorkspaceActions } from "@/hooks/use-workspace-actions"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useAppStore } from "@/lib/store"
import type { Project, Workspace } from "@/lib/types"

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// Returns when an archived item will be permanently deleted (30 days after archiving).
// Shown next to each archived row.
function deletesAt(archivedAt: string) {
  return new Date(new Date(archivedAt).getTime() + THIRTY_DAYS_MS)
}

type DeleteTarget =
  | { type: "project"; entity: Project }
  | { type: "workspace"; entity: Workspace }

// "Archived <date> · deletes <date>" line for an archived row.
// Shared by workspace and project rows.
function ArchivedDates({ archivedAt }: { archivedAt: string }) {
  return (
    <div className="text-mute text-[11px]">
      Archived {new Date(archivedAt).toLocaleDateString()} · deletes{" "}
      {deletesAt(archivedAt).toLocaleDateString()}
    </div>
  )
}

// Restore and Delete buttons for one archived row.
// Delete opens the permanent-delete confirmation.
function RestoreDeleteButtons({
  onRestore,
  onDelete,
}: {
  onRestore: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        onClick={onRestore}
        className="border-hairline hover:bg-surface-soft h-8 rounded-sm border px-3 text-xs font-medium"
      >
        Restore
      </button>
      <button
        onClick={onDelete}
        className="border-hairline text-danger hover:bg-danger/10 h-8 rounded-sm border px-3 text-xs font-medium"
      >
        Delete
      </button>
    </div>
  )
}

// Archive page: the user's own archived workspaces and projects with restore and delete.
// Only owned items are listed, since only owners can act on them.
export function ArchiveView() {
  const allWorkspaces = useWorkspaces({ includeArchived: true })
  const allProjects = useAppStore((s) => s.projects)
  const { restore: restoreProject, remove: deleteProject } = useProjectActions()
  const { restore: restoreWorkspace, remove: deleteWorkspace } =
    useWorkspaceActions()
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const { ownsWorkspace, ownsProject } = useIsOwner()

  // A workspace delete cascades to all its projects, so the dialog lists them.
  const projectsIn = (workspaceId: string) =>
    allProjects.filter((p) => p.workspaceId === workspaceId)

  // Owned only: the server refuses these actions for anyone else.
  const archivedWorkspaces = allWorkspaces.filter(
    (w) => w.archivedAt && ownsWorkspace(w),
  )
  const archivedProjects = allProjects.filter(
    (p) => p.archivedAt && ownsProject(p),
  )
  const isEmpty =
    archivedWorkspaces.length === 0 && archivedProjects.length === 0

  // Permanently deletes whichever item the confirm dialog was opened for.
  const confirmDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.type === "project") void deleteProject(deleteTarget.entity)
    else void deleteWorkspace(deleteTarget.entity)
  }

  return (
    <>
      <TopBar breadcrumbs={[{ label: "archive" }]} />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl space-y-6 p-6">
          {isEmpty ? (
            <EmptyState
              icon={<ArchiveIcon className="h-8 w-8" />}
              title="Nothing archived"
              description="Projects and workspaces you archive show up here for 30 days before they're gone for good."
            />
          ) : (
            <>
              <PageCard className="p-5">
                <SectionHeader
                  label={`Archived workspaces · ${archivedWorkspaces.length}`}
                />
                {archivedWorkspaces.length === 0 ? (
                  <p className="text-mute text-sm">No archived workspaces.</p>
                ) : (
                  <ul className="divide-hairline -mx-2 divide-y">
                    {archivedWorkspaces.map((w) => (
                      <li
                        key={w.id}
                        className="flex items-center gap-3 px-2 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {w.name}
                          </div>
                          <ArchivedDates archivedAt={w.archivedAt!} />
                        </div>
                        <RestoreDeleteButtons
                          onRestore={() => void restoreWorkspace(w)}
                          onDelete={() =>
                            setDeleteTarget({ type: "workspace", entity: w })
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </PageCard>

              <PageCard className="p-5">
                <SectionHeader
                  label={`Archived projects · ${archivedProjects.length}`}
                />
                {archivedProjects.length === 0 ? (
                  <p className="text-mute text-sm">No archived projects.</p>
                ) : (
                  <ul className="divide-hairline -mx-2 divide-y">
                    {archivedProjects.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center gap-3 px-2 py-3"
                      >
                        <FolderGit2 className="text-mute h-4 w-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {p.name}
                          </div>
                          <div className="text-mute truncate text-[11px]">
                            {p.stack.join(" / ") || p.initialPrompt}
                          </div>
                          <ArchivedDates archivedAt={p.archivedAt!} />
                        </div>
                        <RestoreDeleteButtons
                          onRestore={() => void restoreProject(p)}
                          onDelete={() =>
                            setDeleteTarget({ type: "project", entity: p })
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </PageCard>
            </>
          )}
        </div>
      </div>

      {deleteTarget && (
        <PermanentDeleteDialog
          name={deleteTarget.entity.name}
          projects={
            deleteTarget.type === "workspace"
              ? projectsIn(deleteTarget.entity.id)
              : []
          }
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  )
}
