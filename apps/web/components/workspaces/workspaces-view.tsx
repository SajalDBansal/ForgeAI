"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Users, FolderGit2, Trash2 } from "lucide-react"

import { TopBar } from "@/components/layout/topbar"
import { PageCard } from "@/components/layout/page-card"
import { EmptyState } from "@/components/layout/empty-state"
import { ArchiveConfirmDialog } from "@/components/shared/archive-confirm-dialog"
import { NewWorkspaceDialog } from "@/components/workspace/new-workspace-dialog"
import { useCollaborators } from "@/hooks/use-collaborators"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useAppStore } from "@/lib/store"
import type { Workspace } from "@/lib/types"
import { displayToast } from "@/lib/toast"

export function WorkspacesView() {
  const router = useRouter()
  const workspaces = useWorkspaces()
  const projects = useAppStore((s) => s.projects)
  const { collaborators } = useCollaborators()
  const archiveWorkspace = useAppStore((s) => s.archiveWorkspace)
  const [createOpen, setCreateOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<Workspace | null>(null)

  const newWorkspaceButton = (
    <button
      onClick={() => setCreateOpen(true)}
      className="h-9 px-3 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep inline-flex items-center gap-1.5"
    >
      <Plus className="h-4 w-4" /> New workspace
    </button>
  )

  return (
    <>
      <TopBar breadcrumbs={[{ label: "workspaces" }]} actions={newWorkspaceButton} />
      <div className="flex-1 min-h-0 overflow-auto">
        {workspaces.length === 0 ? (
          <EmptyState
            icon={<FolderGit2 className="h-8 w-8" />}
            title="No workspaces yet"
            description="There is no workspace available for you right now."
            action={newWorkspaceButton}
          />
        ) : (
          <div className="p-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {workspaces.map((w) => {
              const projectCount = projects.filter((p) => p.workspaceId === w.id && !p.archivedAt).length
              const collaboratorCount = collaborators.filter((c) => c.workspaceId === w.id).length
              return (
                <PageCard key={w.id} className="relative group p-4 hover:border-hairline-strong">
                  {w.deleteable !== false && (
                    <button
                      onClick={() => setArchiveTarget(w)}
                      className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 h-6 w-6 grid place-items-center text-mute hover:text-danger rounded-sm hover:bg-surface-soft"
                      aria-label={`Archive ${w.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <div onClick={() => router.push(`/workspaces/${w.id}`)} className="cursor-pointer">
                    <h3 className="font-bold text-sm truncate pr-6">{w.name}</h3>
                    <div className="mt-4 flex items-center gap-4 text-[11px] text-mute">
                      <span className="flex items-center gap-1.5">
                        <FolderGit2 className="h-3.5 w-3.5" /> {projectCount} project{projectCount === 1 ? "" : "s"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" /> {collaboratorCount} collaborator{collaboratorCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                </PageCard>
              )
            })}
          </div>
        )}
      </div>

      {createOpen && (
        <NewWorkspaceDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => router.push(`/workspaces/${id}`)}
        />
      )}

      {archiveTarget && (
        <ArchiveConfirmDialog
          name={archiveTarget.name}
          onClose={() => setArchiveTarget(null)}
          onConfirm={() => {
            archiveWorkspace(archiveTarget.id)
            displayToast(`Archived "${archiveTarget.name}"`)
          }}
        />
      )}
    </>
  )
}
