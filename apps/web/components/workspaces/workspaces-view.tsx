"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Users, FolderGit2, LogOut, Trash2 } from "lucide-react"

import { TopBar } from "@/components/layout/topbar"
import { PageCard } from "@/components/layout/page-card"
import { EmptyState } from "@/components/layout/empty-state"
import { ArchiveConfirmDialog } from "@/components/shared/archive-confirm-dialog"
import { LeaveWorkspaceDialog } from "@/components/shared/leave-workspace-dialog"
import { NewWorkspaceDialog } from "@/components/workspace/new-workspace-dialog"
import { useCollaborators } from "@/hooks/use-collaborators"
import { useIsOwner } from "@/hooks/use-is-owner"
import { useLeaveWorkspace } from "@/hooks/use-leave-workspace"
import { useWorkspaceActions } from "@/hooks/use-workspace-actions"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useAppStore } from "@/lib/store"
import type { Workspace } from "@/lib/types"

const cornerButtonClass =
  "absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 h-6 w-6 grid place-items-center text-mute hover:text-danger rounded-sm hover:bg-surface-soft"

// One workspace card with project and collaborator counts.
// Owners get an archive button; collaborators get a leave button in the same corner.
function WorkspaceCard({
  workspace: w,
  owned,
  projectCount,
  collaboratorCount,
  onOpen,
  onArchive,
  onLeave,
}: {
  workspace: Workspace
  owned: boolean
  projectCount: number
  collaboratorCount: number
  onOpen: () => void
  onArchive: () => void
  onLeave: () => void
}) {
  return (
    <PageCard className="group hover:border-hairline-strong relative p-4">
      {owned ? (
        w.deleteable !== false && (
          <button
            onClick={onArchive}
            className={cornerButtonClass}
            aria-label={`Archive ${w.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )
      ) : (
        <button
          onClick={onLeave}
          className={cornerButtonClass}
          aria-label={`Leave ${w.name}`}
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      )}
      <div onClick={onOpen} className="cursor-pointer">
        <h3 className="truncate pr-6 text-sm font-bold">{w.name}</h3>
        <div className="text-mute mt-4 flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <FolderGit2 className="h-3.5 w-3.5" /> {projectCount} project
            {projectCount === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> {collaboratorCount} collaborator
            {collaboratorCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </PageCard>
  )
}

// Workspaces page: a card per workspace plus create, archive and leave dialogs.
// Archive is owner-only; collaborators can leave instead.
export function WorkspacesView() {
  const router = useRouter()
  const workspaces = useWorkspaces()
  const projects = useAppStore((s) => s.projects)
  const { collaborators } = useCollaborators()
  const { archive } = useWorkspaceActions()
  const [createOpen, setCreateOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<Workspace | null>(null)
  const [leaveTarget, setLeaveTarget] = useState<Workspace | null>(null)
  const { ownsWorkspace } = useIsOwner()
  const { leave, leaving } = useLeaveWorkspace()

  // Live projects that would be archived with a workspace, listed in the dialog.
  const projectsIn = (workspaceId: string) =>
    projects.filter((p) => p.workspaceId === workspaceId && !p.archivedAt)

  const newWorkspaceButton = (
    <button
      onClick={() => setCreateOpen(true)}
      className="bg-ink text-on-primary hover:bg-ink-deep inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-sm font-medium"
    >
      <Plus className="h-4 w-4" /> New workspace
    </button>
  )

  return (
    <>
      <TopBar
        breadcrumbs={[{ label: "workspaces" }]}
        actions={newWorkspaceButton}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {workspaces.length === 0 ? (
          <EmptyState
            icon={<FolderGit2 className="h-8 w-8" />}
            title="No workspaces yet"
            description="There is no workspace available for you right now."
            action={newWorkspaceButton}
          />
        ) : (
          <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((w) => (
              <WorkspaceCard
                key={w.id}
                workspace={w}
                owned={ownsWorkspace(w)}
                projectCount={projectsIn(w.id).length}
                collaboratorCount={
                  collaborators.filter((c) => c.workspaceId === w.id).length
                }
                onOpen={() => router.push(`/workspaces/${w.id}`)}
                onArchive={() => setArchiveTarget(w)}
                onLeave={() => setLeaveTarget(w)}
              />
            ))}
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
          projects={projectsIn(archiveTarget.id)}
          onClose={() => setArchiveTarget(null)}
          onConfirm={() => void archive(archiveTarget)}
        />
      )}

      {leaveTarget && (
        <LeaveWorkspaceDialog
          name={leaveTarget.name}
          leaving={leaving}
          onClose={() => setLeaveTarget(null)}
          onConfirm={() =>
            void leave(leaveTarget).then(() => setLeaveTarget(null))
          }
        />
      )}
    </>
  )
}
