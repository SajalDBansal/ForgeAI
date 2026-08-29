"use client"

import { useState } from "react"
import { Archive as ArchiveIcon, FolderGit2 } from "lucide-react"

import { TopBar } from "@/components/layout/topbar"
import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { EmptyState } from "@/components/layout/empty-state"
import { PermanentDeleteDialog } from "@/components/shared/permanent-delete-dialog"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useAppStore } from "@/lib/store"
import { displayToast } from "@/lib/toast"

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function deletesAt(archivedAt: string) {
  return new Date(new Date(archivedAt).getTime() + THIRTY_DAYS_MS)
}

type DeleteTarget = { type: "project" | "workspace"; id: string; name: string }

export function ArchiveView() {
  const allWorkspaces = useWorkspaces({ includeArchived: true })
  const allProjects = useAppStore((s) => s.projects)
  const restoreProject = useAppStore((s) => s.restoreProject)
  const restoreWorkspace = useAppStore((s) => s.restoreWorkspace)
  const deleteProject = useAppStore((s) => s.deleteProject)
  const deleteWorkspace = useAppStore((s) => s.deleteWorkspace)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  const archivedWorkspaces = allWorkspaces.filter((w) => w.archivedAt)
  const archivedProjects = allProjects.filter((p) => p.archivedAt)
  const isEmpty = archivedWorkspaces.length === 0 && archivedProjects.length === 0

  const confirmDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.type === "project") deleteProject(deleteTarget.id)
    else deleteWorkspace(deleteTarget.id)
    displayToast(`Deleted "${deleteTarget.name}"`)
  }

  return (
    <>
      <TopBar breadcrumbs={[{ label: "archive" }]} />
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="p-6 max-w-3xl mx-auto space-y-6">
          {isEmpty ? (
            <EmptyState
              icon={<ArchiveIcon className="h-8 w-8" />}
              title="Nothing archived"
              description="Projects and workspaces you archive show up here for 30 days before they're gone for good."
            />
          ) : (
            <>
              <PageCard className="p-5">
                <SectionHeader label={`Archived workspaces · ${archivedWorkspaces.length}`} />
                {archivedWorkspaces.length === 0 ? (
                  <p className="text-sm text-mute">No archived workspaces.</p>
                ) : (
                  <ul className="divide-y divide-hairline -mx-2">
                    {archivedWorkspaces.map((w) => (
                      <li key={w.id} className="px-2 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{w.name}</div>
                          <div className="text-[11px] text-mute">
                            Archived {new Date(w.archivedAt!).toLocaleDateString()} · deletes{" "}
                            {deletesAt(w.archivedAt!).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              restoreWorkspace(w.id)
                              displayToast(`Restored "${w.name}"`)
                            }}
                            className="h-8 px-3 border border-hairline rounded-sm text-xs font-medium hover:bg-surface-soft"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ type: "workspace", id: w.id, name: w.name })}
                            className="h-8 px-3 border border-hairline rounded-sm text-xs font-medium text-danger hover:bg-danger/10"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </PageCard>

              <PageCard className="p-5">
                <SectionHeader label={`Archived projects · ${archivedProjects.length}`} />
                {archivedProjects.length === 0 ? (
                  <p className="text-sm text-mute">No archived projects.</p>
                ) : (
                  <ul className="divide-y divide-hairline -mx-2">
                    {archivedProjects.map((p) => (
                      <li key={p.id} className="px-2 py-3 flex items-center gap-3">
                        <FolderGit2 className="h-4 w-4 text-mute shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{p.name}</div>
                          <div className="text-[11px] text-mute truncate">{p.stack.join(" / ") || p.initialPrompt}</div>
                          <div className="text-[11px] text-mute">
                            Archived {new Date(p.archivedAt!).toLocaleDateString()} · deletes{" "}
                            {deletesAt(p.archivedAt!).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              restoreProject(p.id)
                              displayToast(`Restored "${p.name}"`)
                            }}
                            className="h-8 px-3 border border-hairline rounded-sm text-xs font-medium hover:bg-surface-soft"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ type: "project", id: p.id, name: p.name })}
                            className="h-8 px-3 border border-hairline rounded-sm text-xs font-medium text-danger hover:bg-danger/10"
                          >
                            Delete
                          </button>
                        </div>
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
          name={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  )
}
