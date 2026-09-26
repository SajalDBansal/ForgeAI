"use client"

import { useState, type FormEvent, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronDown,
  LayoutTemplate,
  LogOut,
  Lock,
  Mail,
  Plus,
  Users,
  X,
} from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@forgeAI/ui/components/select"

import { TopBar } from "@/components/layout/topbar"
import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { EmptyState } from "@/components/layout/empty-state"
import { ProjectsBrowser } from "@/components/projects/projects-browser"
import { useCollaborators } from "@/hooks/use-collaborators"
import { useIdempotencyKey } from "@/hooks/use-idempotency-key"
import { useIsOwner } from "@/hooks/use-is-owner"
import {
  canContribute,
  useWorkspaceRole,
  WORKSPACE_ROLE_LABEL,
} from "@/hooks/use-workspace-role"
import { CreateEmptyProjectDialog } from "@/components/home/create-empty-project-dialog"
import { useLeaveWorkspace } from "@/hooks/use-leave-workspace"
import { useSession } from "@/hooks/use-session"
import { LeaveWorkspaceDialog } from "@/components/shared/leave-workspace-dialog"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useAppStore } from "@/lib/store"
import { inviteCollaborator, removeCollaborator } from "@/lib/collaborators"
import {
  collaboratorInitials,
  type AccountCollaborator,
  type CollaboratorRole,
  type TemplateListItem,
} from "@/lib/types"
import { displayToast } from "@/lib/toast"

const READ_ONLY_HINT =
  "You have view-only access — ask the owner to make you an editor to create projects here."

// Shown when the workspace id doesn't match any workspace the user can see.
// Links back to the workspaces list.
function WorkspaceNotFound() {
  return (
    <>
      <TopBar
        breadcrumbs={[
          { label: "workspaces", href: "/workspaces" },
          { label: "not found" },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <PageCard className="mx-auto max-w-md p-6 text-center">
          <p className="text-body text-sm">
            This workspace does not exist, or was created in a different browser
            session.
          </p>
          <Link
            href="/workspaces"
            className="text-ink mt-3 inline-block text-sm underline underline-offset-4"
          >
            Back to workspaces
          </Link>
        </PageCard>
      </div>
    </>
  )
}

// A card with a clickable title that expands or collapses its content.
// Used for the Collaborators and Templates sections (collapsed by default).
function CollapsibleSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <PageCard className="p-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <span className="text-mute text-[11px] tracking-widest uppercase">
          {title}
        </span>
        <ChevronDown
          className={`text-mute h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && children}
    </PageCard>
  )
}

// Owner-only form that invites a collaborator by email as an editor or viewer.
// Calls `onInvited` so the collaborator list can refresh.
function InviteForm({
  workspaceId,
  onInvited,
}: {
  workspaceId: string
  onInvited: () => Promise<void>
}) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<CollaboratorRole>("EDITOR")
  const [inviting, setInviting] = useState(false)
  const idempotency = useIdempotencyKey()

  // Sends the invite, shows the result and clears the field on success.
  const invite = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.includes("@")) return
    setInviting(true)
    const result = await inviteCollaborator(
      workspaceId,
      email,
      role,
      idempotency.key(`${email}|${role}`),
    )
    setInviting(false)
    if (!result.ok && result.inProgress) return
    displayToast(result.message)
    if (!result.ok) return
    idempotency.renew()
    setEmail("")
    await onInvited()
  }

  return (
    <div>
      <SectionHeader
        label="Invite by email"
        hint="They'll get access to every project in this workspace"
      />
      <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <div className="relative">
            <Mail className="text-mute absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="teammate@studio.dev"
              className="bg-canvas border-hairline focus:border-ink h-10 w-full rounded-sm border pr-3 pl-8 text-sm focus:outline-none"
            />
          </div>
        </div>
        <Select
          value={role}
          onValueChange={(v) => setRole(v as CollaboratorRole)}
        >
          <SelectTrigger className="border-hairline bg-canvas h-10 rounded-sm text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EDITOR">Editor</SelectItem>
            <SelectItem value="VIEWER">Viewer</SelectItem>
          </SelectContent>
        </Select>
        <button
          type="submit"
          disabled={inviting}
          className="bg-ink text-on-primary hover:bg-ink-deep inline-flex h-10 items-center gap-1.5 rounded-sm px-4 text-sm font-medium disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {inviting ? "Inviting…" : "Invite"}
        </button>
      </form>
    </div>
  )
}

// One collaborator row: avatar, name, email and role.
// The owner can remove anyone; others can only leave via their own row.
function CollaboratorRow({
  collaborator: c,
  isMe,
  isOwner,
  onRemove,
  onLeave,
}: {
  collaborator: AccountCollaborator
  isMe: boolean
  isOwner: boolean
  onRemove: () => void
  onLeave: () => void
}) {
  return (
    <li className="flex items-center gap-3 px-2 py-3">
      <div className="bg-ink text-on-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-sm font-bold">
        {collaboratorInitials(c.user.name, c.user.email)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{c.user.name}</span>
          {isMe && (
            <span className="text-mute border-hairline shrink-0 rounded-sm border px-1 py-0.5 text-[10px] tracking-widest uppercase">
              me
            </span>
          )}
        </div>
        <div className="text-mute truncate text-xs">{c.user.email}</div>
      </div>
      <span className="text-mute bg-surface-card shrink-0 rounded-sm px-2 py-1 text-[10px] tracking-widest uppercase">
        {c.role}
      </span>
      {isOwner ? (
        <button
          onClick={onRemove}
          aria-label={`Remove ${c.user.name}`}
          className="text-mute hover:text-danger shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      ) : isMe ? (
        <button
          onClick={onLeave}
          className="border-hairline text-danger hover:bg-danger/10 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium"
        >
          <LogOut className="h-3.5 w-3.5" /> Leave
        </button>
      ) : (
        <span className="w-4 shrink-0" aria-hidden />
      )}
    </li>
  )
}

// Lists templates created in this workspace, each linking to its detail page.
// Shows an empty state when there are none.
function WorkspaceTemplateList({
  templates,
}: {
  templates: TemplateListItem[]
}) {
  return (
    <div className="mt-4">
      <SectionHeader
        label="Created in this workspace"
        hint="Private to everyone with access here"
      />
      {templates.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate className="h-8 w-8" />}
          title="No templates yet"
          description="Templates created in this workspace will show up here."
        />
      ) : (
        <ul className="divide-hairline -mx-2 divide-y">
          {templates.map((t) => (
            <li key={t.id}>
              <Link
                href={`/templates/${t.id}`}
                className="hover:bg-surface-soft flex items-center gap-3 px-2 py-3"
              >
                <div className="bg-surface-card border-hairline flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border">
                  <LayoutTemplate className="text-mute h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.name}</div>
                  <div className="text-mute truncate text-xs">
                    {t.description}
                  </div>
                </div>
                <span className="text-mute bg-surface-card shrink-0 rounded-sm px-2 py-1 text-[10px] tracking-widest uppercase">
                  {t.tag}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Workspace page: collaborators, workspace templates and projects, with invite/leave actions.
// What you can do depends on your role (owner, editor or viewer).
export function WorkspaceDetailView({ workspaceId }: { workspaceId: string }) {
  const workspaces = useWorkspaces()
  const workspace = workspaces.find((w) => w.id === workspaceId)

  const projects = useAppStore((s) => s.projects).filter(
    (p) => p.workspaceId === workspaceId,
  )
  const templates = useAppStore((s) => s.templates).filter(
    (t) => t.workspaceId === workspaceId,
  )
  const { collaborators: allCollaborators, refresh } = useCollaborators()
  const collaborators = allCollaborators.filter(
    (c) => c.workspaceId === workspaceId,
  )

  const [leaveOpen, setLeaveOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)

  const myRole = useWorkspaceRole(workspaceId)
  const mayAddProject = canContribute(myRole)

  const router = useRouter()
  const { session } = useSession()
  const { ownsWorkspace } = useIsOwner()
  const { leave, leaving } = useLeaveWorkspace()
  const isOwner = !!workspace && ownsWorkspace(workspace)
  const myUserId = session?.user?.id

  if (!workspace) return <WorkspaceNotFound />

  // Removes a collaborator and refreshes the list on success.
  const remove = async (target: AccountCollaborator) => {
    const result = await removeCollaborator(
      workspaceId,
      target.user.id,
      target.user.name,
    )
    displayToast(result.message)
    if (result.ok) await refresh()
  }

  return (
    <>
      <TopBar
        breadcrumbs={[
          { label: "workspaces", href: "/workspaces" },
          { label: workspace.name },
        ]}
        actions={
          myRole && (
            <span className="text-mute border-hairline rounded-sm border px-2 py-1 text-[10px] tracking-widest uppercase">
              {WORKSPACE_ROLE_LABEL[myRole]}
            </span>
          )
        }
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-6">
          <CollapsibleSection title={`Collaborators · ${collaborators.length}`}>
            <div className="mt-4 space-y-5">
              {!isOwner ? (
                <div className="border-hairline bg-surface-soft flex items-start gap-2.5 rounded-sm border px-3 py-2.5">
                  <Lock className="text-mute mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p className="text-body text-sm">
                    Only the owner of this workspace can add a collaborator.
                  </p>
                </div>
              ) : (
                <InviteForm workspaceId={workspaceId} onInvited={refresh} />
              )}

              <div className="hairline-t pt-5">
                {collaborators.length === 0 ? (
                  <EmptyState
                    icon={<Users className="h-8 w-8" />}
                    title="No collaborators yet"
                    description="Invite a teammate above to give them access to this workspace."
                  />
                ) : (
                  <ul className="divide-hairline -mx-2 divide-y">
                    {collaborators.map((c) => (
                      <CollaboratorRow
                        key={c.id}
                        collaborator={c}
                        isMe={c.user.id === myUserId}
                        isOwner={isOwner}
                        onRemove={() => void remove(c)}
                        onLeave={() => setLeaveOpen(true)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title={`Templates · ${templates.length}`}>
            <WorkspaceTemplateList templates={templates} />
          </CollapsibleSection>

          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-mute text-[11px] tracking-widest uppercase">
                Projects · {projects.length}
              </h2>
              <button
                onClick={() => setNewProjectOpen(true)}
                disabled={!mayAddProject}
                title={mayAddProject ? undefined : READ_ONLY_HINT}
                className="bg-ink text-on-primary hover:bg-ink-deep disabled:hover:bg-ink inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add project
              </button>
            </div>
            <ProjectsBrowser
              projects={projects}
              showAuthor
              emptyAction={
                mayAddProject ? (
                  <button
                    onClick={() => setNewProjectOpen(true)}
                    className="bg-ink text-on-primary hover:bg-ink-deep inline-flex h-9 items-center gap-1.5 rounded-sm px-4 text-sm font-medium"
                  >
                    <Plus className="h-4 w-4" /> Add project
                  </button>
                ) : (
                  <p className="text-mute text-sm">{READ_ONLY_HINT}</p>
                )
              }
            />
          </div>
        </div>
      </div>

      {newProjectOpen && (
        <CreateEmptyProjectDialog
          workspaceId={workspace.id}
          onClose={() => setNewProjectOpen(false)}
        />
      )}

      {leaveOpen && (
        <LeaveWorkspaceDialog
          name={workspace.name}
          leaving={leaving}
          onClose={() => setLeaveOpen(false)}
          onConfirm={() => {
            void leave(workspace).then((left) => {
              setLeaveOpen(false)
              if (left) router.push("/workspaces")
            })
          }}
        />
      )}
    </>
  )
}
