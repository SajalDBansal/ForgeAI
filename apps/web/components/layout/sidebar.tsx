"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Plus,
  Search,
  Star,
  Trash2,
  FolderGit2,
  LayoutTemplate,
  Settings,
  HelpCircle,
} from "lucide-react"

import { Button } from "@forgeAI/ui/components/button"
import { Input } from "@forgeAI/ui/components/input"
import { ScrollArea } from "@forgeAI/ui/components/scroll-area"
import { Skeleton } from "@forgeAI/ui/components/skeleton"

import { Wordmark } from "@/components/brand/wordmark"
import { UserMenu } from "@/components/layout/user-menu"
import { ArchiveConfirmDialog } from "@/components/shared/archive-confirm-dialog"
import { NewWorkspaceDialog } from "@/components/workspace/new-workspace-dialog"
import { useProjectActions } from "@/hooks/use-project-actions"
import { useSession } from "@/hooks/use-session"
import { useWorkspaceActions } from "@/hooks/use-workspace-actions"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useAppStore } from "@/lib/store"
import { displayToast } from "@/lib/toast"
import type { Project, Workspace } from "@/lib/types"

type ArchiveTarget =
  | { type: "project"; entity: Project }
  | { type: "workspace"; entity: Workspace }

const rowLinkClass =
  "flex-1 min-w-0 text-left px-3 py-1.5 text-sm text-body hover:bg-surface-soft rounded-sm truncate flex items-center gap-2"
const rowArchiveClass =
  "absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity text-mute hover:text-danger rounded-sm hover:bg-surface-soft"

// Filters active projects by the search text, starred first then most recently used, top 6.
// Feeds the sidebar's "Recent" list.
function recentProjects(active: Project[], query: string): Project[] {
  const q = query.toLowerCase()
  return active
    .filter(
      (p) =>
        !query ||
        p.name.toLowerCase().includes(q) ||
        (p.description ?? p.initialPrompt ?? "").toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const starDiff = Number(b.starred ?? false) - Number(a.starred ?? false)
      if (starDiff !== 0) return starDiff
      return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
    })
    .slice(0, 6)
}

// App sidebar: new project, search, workspaces, recent projects and account links.
// Hidden/shown with Cmd+B via the `forge:toggle-sidebar` event.
export function Sidebar() {
  const { session } = useSession()
  const signedIn = Boolean(session)
  const router = useRouter()
  const workspaces = useWorkspaces()
  const projects = useAppStore((s) => s.projects)
  const metadataStatus = useAppStore((s) => s.metadataStatus)
  const metadataLoading = signedIn && metadataStatus !== "loaded"
  const { archive: archiveProject } = useProjectActions()
  const { archive: archiveWorkspace } = useWorkspaceActions()
  const [query, setQuery] = useState("")
  const [hidden, setHidden] = useState(false)
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null)

  useEffect(() => {
    const onToggle = () => setHidden((v) => !v)
    window.addEventListener("forge:toggle-sidebar", onToggle)
    return () => window.removeEventListener("forge:toggle-sidebar", onToggle)
  }, [])

  if (hidden) return null

  const activeProjects = projects.filter((p) => !p.archivedAt)
  const activeWorkspaces = workspaces.filter((w) => !w.archivedAt)

  // Archives whichever project or workspace the confirm dialog was opened for.
  const confirmArchive = () => {
    if (!archiveTarget) return
    if (archiveTarget.type === "project")
      void archiveProject(archiveTarget.entity)
    else void archiveWorkspace(archiveTarget.entity)
  }

  return (
    <aside className="hairline-r sticky top-0 hidden h-screen w-64 shrink-0 flex-col md:flex">
      <div className="hairline-b shrink-0 px-5 py-5">
        <Link href="/">
          <Wordmark scale={1.1} />
        </Link>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mt-4 px-4">
          <Button
            onClick={() => router.push("/")}
            className="bg-ink text-on-primary hover:bg-ink-deep h-10 w-full justify-start gap-2 rounded-sm"
          >
            <Plus className="h-4 w-4" /> New project
          </Button>
        </div>

        {signedIn && (
          <div className="relative mt-3 px-4">
            <Search className="text-mute absolute top-1/2 left-6 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className="border-hairline focus-visible:border-ink h-9 rounded-sm pl-8 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
        )}

        <nav className="mt-5 space-y-0.5 px-2 text-sm">
          <SideLink
            icon={<FolderGit2 className="h-4 w-4" />}
            label="Recent"
            href="/projects"
            active
          />
          <SideLink
            icon={<LayoutTemplate className="h-4 w-4" />}
            label="Templates"
            href="/templates"
          />
        </nav>

        <div className="mt-6 flex items-center justify-between px-4">
          <Link
            href="/workspaces"
            className="text-mute hover:text-ink text-[11px] tracking-widest uppercase"
          >
            Workspaces
          </Link>
          <button
            onClick={() => setNewWorkspaceOpen(true)}
            className="text-mute hover:text-ink hover:bg-surface-soft grid h-5 w-5 place-items-center rounded-sm"
            aria-label="New workspace"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <WorkspaceList
          signedIn={signedIn}
          loading={metadataLoading}
          workspaces={activeWorkspaces}
          onArchive={(w) => setArchiveTarget({ type: "workspace", entity: w })}
        />

        <div className="text-mute mt-6 px-4 text-[11px] tracking-widest uppercase">
          Recent
        </div>
        <RecentProjectList
          signedIn={signedIn}
          loading={metadataLoading}
          hasProjects={activeProjects.length > 0}
          projects={recentProjects(activeProjects, query)}
          onArchive={(p) => setArchiveTarget({ type: "project", entity: p })}
          onCreate={() => router.push("/")}
        />
      </ScrollArea>

      {newWorkspaceOpen && (
        <NewWorkspaceDialog onClose={() => setNewWorkspaceOpen(false)} />
      )}
      {archiveTarget && (
        <ArchiveConfirmDialog
          name={archiveTarget.entity.name}
          onClose={() => setArchiveTarget(null)}
          onConfirm={confirmArchive}
        />
      )}

      <div className="hairline-t shrink-0 space-y-0.5 p-3">
        <SideLink
          icon={<Settings className="h-4 w-4" />}
          label="Settings"
          href="/settings"
        />
        <SideLink
          icon={<HelpCircle className="h-4 w-4" />}
          label="Help"
          href="/help"
        />
        <div className="mt-3">
          <UserMenu />
        </div>
      </div>
    </aside>
  )
}

// Sidebar list of up to three workspaces, with an archive button on deletable ones.
// Shows sign-in, loading and empty states as needed.
function WorkspaceList({
  signedIn,
  loading,
  workspaces,
  onArchive,
}: {
  signedIn: boolean
  loading: boolean
  workspaces: Workspace[]
  onArchive: (workspace: Workspace) => void
}) {
  if (!signedIn)
    return (
      <p className="text-mute mt-1 px-5 py-1.5 text-xs">
        Sign in to see your workspaces
      </p>
    )
  if (loading) return <RowSkeletons count={3} />
  if (workspaces.length === 0)
    return (
      <p className="text-mute mt-1 px-5 py-1.5 text-xs">No workspaces yet.</p>
    )

  return (
    <>
      <ul className="mt-1 space-y-0.5 px-2">
        {workspaces.slice(0, 3).map((w) => (
          <li key={w.id} className="group flex items-center">
            <Link href={`/workspaces/${w.id}`} className={rowLinkClass}>
              <span className="text-mute shrink-0">[+]</span>
              <span className="truncate">{w.name}</span>
            </Link>
            {w.deleteable !== false && (
              <div className="relative grid h-6 w-6 shrink-0 place-items-center">
                <button
                  onClick={() => onArchive(w)}
                  className={rowArchiveClass}
                  aria-label={`Archive ${w.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {workspaces.length > 3 && (
        <Link
          href="/workspaces"
          className="text-mute hover:text-ink mt-0.5 block px-5 py-1 text-xs"
        >
          … see more
        </Link>
      )}
    </>
  )
}

// Sidebar list of recent projects with a star marker and an archive button.
// Shows sign-in, loading and "create your first project" states as needed.
function RecentProjectList({
  signedIn,
  loading,
  hasProjects,
  projects,
  onArchive,
  onCreate,
}: {
  signedIn: boolean
  loading: boolean
  hasProjects: boolean
  projects: Project[]
  onArchive: (project: Project) => void
  onCreate: () => void
}) {
  if (!signedIn)
    return (
      <p className="text-mute mt-1 px-5 py-1.5 pb-4 text-xs">
        Sign in to see your recent projects
      </p>
    )
  if (loading) {
    return (
      <div className="pb-4">
        <RowSkeletons count={5} />
      </div>
    )
  }
  if (!hasProjects) {
    return (
      <div className="mt-1 px-5 py-1.5 pb-4">
        <p className="text-mute text-xs">No projects created yet.</p>
        <button
          onClick={onCreate}
          className="text-ink mt-1 text-xs underline underline-offset-4"
        >
          Create a new project
        </button>
      </div>
    )
  }

  return (
    <ul className="mt-1 space-y-0.5 px-2 pb-4">
      {projects.map((p) => (
        <li key={p.id} className="group flex items-center">
          <Link href={`/${p.id}`} className={rowLinkClass}>
            <span className="text-mute shrink-0">[+]</span>
            <span className="truncate">{p.name}</span>
          </Link>
          <div className="relative grid h-6 w-6 shrink-0 place-items-center">
            {p.starred && (
              <Star className="text-mute pointer-events-none absolute h-3 w-3 fill-current opacity-100 transition-opacity group-hover:opacity-0" />
            )}
            <button
              onClick={() => onArchive(p)}
              className={rowArchiveClass}
              aria-label={`Archive ${p.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

// Placeholder rows shown while workspaces and projects load.
// Keeps the sidebar from jumping when data arrives.
function RowSkeletons({ count }: { count: number }) {
  return (
    <div className="mt-1 space-y-0.5 px-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="px-3 py-1.5">
          <Skeleton className="bg-surface-card h-4 w-full max-w-[10rem] rounded-sm" />
        </div>
      ))}
    </div>
  )
}

// One sidebar navigation link, or a mock button when no href is given.
// Highlighted when `active`.
function SideLink({
  icon,
  label,
  active,
  href,
}: {
  icon: ReactNode
  label: string
  active?: boolean
  href?: string
}) {
  const className = `w-full flex items-center gap-2.5 px-3 py-1.5 rounded-sm text-sm ${
    active
      ? "bg-surface-card text-ink font-medium"
      : "text-body hover:bg-surface-soft"
  }`

  if (href) {
    return (
      <Link href={href} className={className}>
        <span className="text-mute">{icon}</span>
        {label}
      </Link>
    )
  }

  return (
    <button
      onClick={() => displayToast(`${label} (mock)`)}
      className={className}
    >
      <span className="text-mute">{icon}</span>
      {label}
    </button>
  )
}
