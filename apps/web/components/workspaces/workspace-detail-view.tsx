"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { ChevronDown, LayoutTemplate, Mail, Plus, Users, X } from "lucide-react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@forgeAI/ui/components/select"

import { TopBar } from "@/components/layout/topbar"
import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { EmptyState } from "@/components/layout/empty-state"
import { ProjectsBrowser } from "@/components/projects/projects-browser"
import { useCollaborators } from "@/hooks/use-collaborators"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useStartProject } from "@/hooks/use-start-project"
import { useAppStore } from "@/lib/store"
import { inviteCollaborator, removeCollaborator } from "@/lib/collaborators"
import { collaboratorInitials, type AccountCollaborator, type CollaboratorRole } from "@/lib/types"
import { displayToast } from "@/lib/toast"

export function WorkspaceDetailView({ workspaceId }: { workspaceId: string }) {
  const workspaces = useWorkspaces()
  const workspace = workspaces.find((w) => w.id === workspaceId)
  const startProject = useStartProject()

  const projects = useAppStore((s) => s.projects).filter((p) => p.workspaceId === workspaceId)
  const templates = useAppStore((s) => s.templates).filter((t) => t.workspaceId === workspaceId)
  const { collaborators: allCollaborators, refresh } = useCollaborators()
  const collaborators = allCollaborators.filter((c) => c.workspaceId === workspaceId)

  const [email, setEmail] = useState("")
  const [role, setRole] = useState<CollaboratorRole>("EDITOR")
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [inviting, setInviting] = useState(false)

  if (!workspace) {
    return (
      <>
        <TopBar breadcrumbs={[{ label: "workspaces", href: "/workspaces" }, { label: "not found" }]} />
        <div className="flex-1 min-h-0 overflow-auto p-6">
          <PageCard className="p-6 text-center max-w-md mx-auto">
            <p className="text-sm text-body">
              This workspace does not exist, or was created in a different browser session.
            </p>
            <Link href="/workspaces" className="mt-3 inline-block text-sm text-ink underline underline-offset-4">
              Back to workspaces
            </Link>
          </PageCard>
        </div>
      </>
    )
  }

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.includes("@")) return
    setInviting(true)
    const result = await inviteCollaborator(workspaceId, email, role)
    setInviting(false)
    displayToast(result.message)
    if (!result.ok) return
    setEmail("")
    await refresh()
  }

  const remove = async (target: AccountCollaborator) => {
    const result = await removeCollaborator(workspaceId, target.user.id, target.user.name)
    displayToast(result.message)
    if (result.ok) await refresh()
  }

  const addProject = () =>
    startProject({
      prompt: `New project in ${workspace.name}`,
      mode: "BUILD",
      source: "MANUAL",
      workspaceId: workspace.id,
    })

  return (
    <>
      <TopBar breadcrumbs={[{ label: "workspaces", href: "/workspaces" }, { label: workspace.name }]} />
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="p-6 max-w-4xl mx-auto space-y-6">
          <PageCard className="p-5">
            <button
              onClick={() => setCollaboratorsOpen((v) => !v)}
              className="w-full flex items-center justify-between"
            >
              <span className="text-[11px] uppercase tracking-widest text-mute">
                Collaborators · {collaborators.length}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-mute transition-transform ${collaboratorsOpen ? "" : "-rotate-90"}`}
              />
            </button>
            {collaboratorsOpen && (
              <div className="mt-4 space-y-5">
                <div>
                  <SectionHeader label="Invite by email" hint="They'll get access to every project in this workspace" />
                  <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[220px]">
                      <div className="relative">
                        <Mail className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
                        <input
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          type="email"
                          placeholder="teammate@studio.dev"
                          className="w-full h-10 pl-8 pr-3 bg-canvas border border-hairline rounded-sm text-sm focus:outline-none focus:border-ink"
                        />
                      </div>
                    </div>
                    <Select value={role} onValueChange={(v) => setRole(v as CollaboratorRole)}>
                      <SelectTrigger className="h-10 rounded-sm border-hairline bg-canvas text-sm">
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
                      className="h-10 px-4 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" /> {inviting ? "Inviting…" : "Invite"}
                    </button>
                  </form>
                </div>

                <div className="pt-5 hairline-t">
                  {collaborators.length === 0 ? (
                    <EmptyState
                      icon={<Users className="h-8 w-8" />}
                      title="No collaborators yet"
                      description="Invite a teammate above to give them access to this workspace."
                    />
                  ) : (
                    <ul className="divide-y divide-hairline -mx-2">
                      {collaborators.map((c) => (
                        <li key={c.id} className="px-2 py-3 flex items-center gap-3">
                          <div className="h-9 w-9 rounded-sm bg-ink text-on-primary flex items-center justify-center font-bold text-sm shrink-0">
                            {collaboratorInitials(c.user.name, c.user.email)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{c.user.name}</div>
                            <div className="text-xs text-mute truncate">{c.user.email}</div>
                          </div>
                          <span className="text-[10px] uppercase tracking-widest text-mute px-2 py-1 bg-surface-card rounded-sm shrink-0">
                            {c.role}
                          </span>
                          <button
                            onClick={() => void remove(c)}
                            aria-label={`Remove ${c.user.name}`}
                            className="text-mute hover:text-danger shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </PageCard>

          <PageCard className="p-5">
            <button
              onClick={() => setTemplatesOpen((v) => !v)}
              className="w-full flex items-center justify-between"
            >
              <span className="text-[11px] uppercase tracking-widest text-mute">
                Templates · {templates.length}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-mute transition-transform ${templatesOpen ? "" : "-rotate-90"}`}
              />
            </button>
            {templatesOpen && (
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
                  <ul className="divide-y divide-hairline -mx-2">
                    {templates.map((t) => (
                      <li key={t.id}>
                        <Link
                          href={`/templates/${t.id}`}
                          className="px-2 py-3 flex items-center gap-3 hover:bg-surface-soft"
                        >
                          <div className="h-9 w-9 rounded-sm bg-surface-card border border-hairline flex items-center justify-center shrink-0">
                            <LayoutTemplate className="h-4 w-4 text-mute" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{t.name}</div>
                            <div className="text-xs text-mute truncate">{t.description}</div>
                          </div>
                          <span className="text-[10px] uppercase tracking-widest text-mute px-2 py-1 bg-surface-card rounded-sm shrink-0">
                            {t.tag}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </PageCard>

          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[11px] uppercase tracking-widest text-mute">Projects · {projects.length}</h2>
              <button
                onClick={addProject}
                className="h-8 px-3 bg-ink text-on-primary rounded-sm text-xs font-medium hover:bg-ink-deep inline-flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" /> Add project
              </button>
            </div>
            <ProjectsBrowser
              projects={projects}
              emptyAction={
                <button
                  onClick={addProject}
                  className="h-9 px-4 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep inline-flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" /> Add project
                </button>
              }
            />
          </div>
        </div>
      </div>
    </>
  )
}
