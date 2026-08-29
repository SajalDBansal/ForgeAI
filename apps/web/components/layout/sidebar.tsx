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
import { useSession } from "@/hooks/use-session"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useAppStore } from "@/lib/store"
import { displayToast } from "@/lib/toast"

type ArchiveTarget = { type: "project" | "workspace"; id: string; name: string }

export function Sidebar() {
  const { session } = useSession()
  const signedIn = Boolean(session)
  const router = useRouter()
  const workspaces = useWorkspaces()
  const projects = useAppStore((s) => s.projects)
  const metadataStatus = useAppStore((s) => s.metadataStatus)
  const metadataLoading = signedIn && metadataStatus !== "loaded"
  const archiveProject = useAppStore((s) => s.archiveProject)
  const archiveWorkspace = useAppStore((s) => s.archiveWorkspace)
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
  const recentProjects = activeProjects
    .filter(
      (p) =>
        !query || p.name.toLowerCase().includes(query.toLowerCase()) || (p.description ?? p.initialPrompt ?? "").toLowerCase().includes(query.toLowerCase())
    )
    .sort((a, b) => {
      const starDiff = Number(b.starred ?? false) - Number(a.starred ?? false)
      if (starDiff !== 0) return starDiff
      return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
    })
    .slice(0, 6)

  const activeWorkspaces = workspaces.filter((w) => !w.archivedAt)
  const visibleWorkspaces = activeWorkspaces.slice(0, 3)
  const hasMoreWorkspaces = activeWorkspaces.length > 3

  const confirmArchive = () => {
    if (!archiveTarget) return
    if (archiveTarget.type === "project") archiveProject(archiveTarget.id)
    else archiveWorkspace(archiveTarget.id)
    displayToast(`Archived "${archiveTarget.name}"`)
  }

  return (
    <aside className="hidden md:flex w-64 shrink-0 hairline-r flex-col h-screen sticky top-0">
      <div className="px-5 py-5 hairline-b shrink-0">
        <Link href="/">
          <Wordmark scale={1.1} />
        </Link>
              </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 mt-4">
          <Button
            onClick={() => router.push("/new")}
            className="w-full h-10 justify-start gap-2 rounded-sm bg-ink text-on-primary hover:bg-ink-deep"
          >
            <Plus className="h-4 w-4" /> New project
          </Button>
        </div>

        {signedIn && (
          <div className="px-4 mt-3 relative">
            <Search className="h-3.5 w-3.5 absolute left-6 top-1/2 -translate-y-1/2 text-mute" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className="h-9 rounded-sm border-hairline pl-8 text-sm shadow-none focus-visible:ring-0 focus-visible:border-ink"
            />
          </div>
        )}

        <nav className="px-2 mt-5 space-y-0.5 text-sm">
          <SideLink icon={<FolderGit2 className="h-4 w-4" />} label="Recent" href="/projects" active />
          <SideLink icon={<LayoutTemplate className="h-4 w-4" />} label="Templates" href="/templates" />
        </nav>

        <div className="px-4 mt-6 flex items-center justify-between">
          <Link
            href="/workspaces"
            className="text-[11px] uppercase tracking-widest text-mute hover:text-ink"
          >
            Workspaces
          </Link>
          <button
            onClick={() => setNewWorkspaceOpen(true)}
            className="h-5 w-5 grid place-items-center text-mute hover:text-ink rounded-sm hover:bg-surface-soft"
            aria-label="New workspace"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {!signedIn ? (
          <p className="mt-1 px-5 py-1.5 text-xs text-mute">Sign in to see your workspaces</p>
        ) : metadataLoading ? (
          <RowSkeletons count={3} />
        ) : activeWorkspaces.length === 0 ? (
          <p className="mt-1 px-5 py-1.5 text-xs text-mute">No workspaces yet.</p>
        ) : (
          <>
            <ul className="mt-1 px-2 space-y-0.5">
              {visibleWorkspaces.map((w) => (
                <li key={w.id} className="group flex items-center">
                  <Link
                    href={`/workspaces/${w.id}`}
                    className="flex-1 min-w-0 text-left px-3 py-1.5 text-sm text-body hover:bg-surface-soft rounded-sm truncate flex items-center gap-2"
                  >
                    <span className="text-mute shrink-0">[+]</span>
                    <span className="truncate">{w.name}</span>
                  </Link>
                  {w.deleteable !== false && (
                    <div className="relative h-6 w-6 shrink-0 grid place-items-center">
                      <button
                        onClick={() => setArchiveTarget({ type: "workspace", id: w.id, name: w.name })}
                        className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity text-mute hover:text-danger rounded-sm hover:bg-surface-soft"
                        aria-label={`Archive ${w.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {hasMoreWorkspaces && (
              <Link
                href="/workspaces"
                className="block mt-0.5 px-5 py-1 text-xs text-mute hover:text-ink"
              >
                … see more
              </Link>
            )}
          </>
        )}

        <div className="px-4 mt-6 text-[11px] uppercase tracking-widest text-mute">
          Recent
        </div>
        {!signedIn ? (
          <p className="mt-1 px-5 py-1.5 pb-4 text-xs text-mute">Sign in to see your recent projects</p>
        ) : metadataLoading ? (
          <div className="pb-4">
            <RowSkeletons count={5} />
          </div>
        ) : activeProjects.length === 0 ? (
          <div className="mt-1 px-5 py-1.5 pb-4">
            <p className="text-xs text-mute">No projects created yet.</p>
            <button
              onClick={() => router.push("/new")}
              className="mt-1 text-xs text-ink underline underline-offset-4"
            >
              Create a new project
            </button>
          </div>
        ) : (
          <ul className="mt-1 px-2 pb-4 space-y-0.5">
            {recentProjects.map((p) => (
              <li key={p.id} className="group flex items-center">
                <Link
                  href={`/${p.id}`}
                  className="flex-1 min-w-0 text-left px-3 py-1.5 text-sm text-body hover:bg-surface-soft rounded-sm truncate flex items-center gap-2"
                >
                  <span className="text-mute shrink-0">[+]</span>
                  <span className="truncate">{p.name}</span>
                </Link>
                <div className="relative h-6 w-6 shrink-0 grid place-items-center">
                  {p.starred && (
                    <Star className="h-3 w-3 text-mute fill-current absolute opacity-100 group-hover:opacity-0 transition-opacity pointer-events-none" />
                  )}
                  <button
                    onClick={() => setArchiveTarget({ type: "project", id: p.id, name: p.name })}
                    className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity text-mute hover:text-danger rounded-sm hover:bg-surface-soft"
                    aria-label={`Archive ${p.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      {newWorkspaceOpen && <NewWorkspaceDialog onClose={() => setNewWorkspaceOpen(false)} />}
      {archiveTarget && (
        <ArchiveConfirmDialog
          name={archiveTarget.name}
          onClose={() => setArchiveTarget(null)}
          onConfirm={confirmArchive}
        />
      )}

      <div className="shrink-0 p-3 hairline-t space-y-0.5">
        <SideLink icon={<Settings className="h-4 w-4" />} label="Settings" href="/settings" />
        <SideLink icon={<HelpCircle className="h-4 w-4" />} label="Help" href="/help" />
        <div className="mt-3">
          <UserMenu />
        </div>
      </div>
    </aside>
  )
}

function RowSkeletons({ count }: { count: number }) {
  return (
    <div className="mt-1 px-2 space-y-0.5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="px-3 py-1.5">
          <Skeleton className="h-4 w-full max-w-[10rem] rounded-sm bg-surface-card" />
        </div>
      ))}
    </div>
  )
}

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
  const className = `w-full flex items-center gap-2.5 px-3 py-1.5 rounded-sm text-sm ${active ? "bg-surface-card text-ink font-medium" : "text-body hover:bg-surface-soft"
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
    <button onClick={() => displayToast(`${label} (mock)`)} className={className}>
      <span className="text-mute">{icon}</span>
      {label}
    </button>
  )
}
