"use client"

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  Filter,
  FolderGit2,
  Grid3x3,
  List,
  Search,
  Star,
  Trash2,
} from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@forgeAI/ui/components/select"

import { PageCard } from "@/components/layout/page-card"
import { EmptyState } from "@/components/layout/empty-state"
import { ArchiveConfirmDialog } from "@/components/shared/archive-confirm-dialog"
import { useProjectActions } from "@/hooks/use-project-actions"
import { useSession } from "@/hooks/use-session"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useAppStore } from "@/lib/store"
import {
  PROJECT_STATUS_LABEL,
  formatRelativeTime,
  type Project,
  type ProjectStatus,
} from "@/lib/types"

type StatusFilter = "All" | ProjectStatus
const STATUSES: StatusFilter[] = [
  "All",
  "READY",
  "BUILDING",
  "PLANNING",
  "NEEDS_INPUT",
]
type SortKey = "used" | "created" | "starred"

// Filters projects by status and search text, then sorts by the chosen key.
// Drives both the grid and list views.
function filterAndSort(
  projects: Project[],
  status: StatusFilter,
  q: string,
  sort: SortKey,
): Project[] {
  return projects
    .filter(
      (p) =>
        (status === "All" || p.status === status) &&
        (!q ||
          p.name.includes(q.toLowerCase()) ||
          (p.initialPrompt ?? "").toLowerCase().includes(q.toLowerCase())),
    )
    .sort((a, b) => {
      if (sort === "created")
        return (
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime()
        )
      if (sort === "starred")
        return Number(b.starred ?? false) - Number(a.starred ?? false)
      return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
    })
}

// Searchable, filterable project list with grid and table views and an archive action.
// Used by the Projects page and each workspace's page.
export function ProjectsBrowser({
  projects,
  showWorkspace = false,
  showAuthor = false,
  emptyAction,
}: {
  projects: Project[]
  showWorkspace?: boolean
  /** Credit each project's creator (useful inside a shared workspace). */
  showAuthor?: boolean
  emptyAction?: ReactNode
}) {
  const router = useRouter()
  const { session } = useSession()
  const myUserId = session?.user?.id
  const workspaces = useWorkspaces()
  const { archive } = useProjectActions()
  const metadataStatus = useAppStore((s) => s.metadataStatus)
  const [q, setQ] = useState("")
  const [view, setView] = useState<"grid" | "list">("grid")
  const [status, setStatus] = useState<StatusFilter>("All")
  const [sort, setSort] = useState<SortKey>("used")
  const [archiveTarget, setArchiveTarget] = useState<Project | null>(null)

  // Returns a workspace's display name, or its id if unknown.
  const workspaceName = (id: string) =>
    workspaces.find((w) => w.id === id)?.name ?? id

  // Returns "you", the creator's name, or null when authors aren't shown.
  const authorOf = (p: Project) => {
    if (!showAuthor || !p.createdById) return null
    return p.createdById === myUserId
      ? "you"
      : (p.createdByName ?? "a teammate")
  }

  const activeProjects = projects.filter((p) => !p.archivedAt)

  if (activeProjects.length === 0 && metadataStatus === "loading") {
    return <EmptyState title="Loading…" description="Fetching your projects." />
  }

  if (activeProjects.length === 0) {
    return (
      <EmptyState
        icon={<FolderGit2 className="h-8 w-8" />}
        title="No projects yet"
        description="There is no project available for you right now."
        action={emptyAction}
      />
    )
  }

  const list = filterAndSort(activeProjects, status, q, sort)
  const open = (p: Project) => router.push(`/${p.id}`)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-md min-w-[240px] flex-1">
          <Search className="text-mute absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter projects…"
            className="bg-surface-soft border-hairline focus:border-ink h-9 w-full rounded-sm border pr-3 pl-8 text-sm focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1 text-sm">
          <Filter className="text-mute mr-1.5 h-3.5 w-3.5" />
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`h-8 rounded-sm px-3 text-xs ${
                status === s
                  ? "bg-ink text-on-primary"
                  : "text-mute hover:text-ink"
              }`}
            >
              {s === "All" ? "All" : PROJECT_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger
            size="sm"
            className="border-hairline bg-canvas h-8 rounded-sm text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="used">Recently used</SelectItem>
            <SelectItem value="created">Recently created</SelectItem>
            <SelectItem value="starred">Starred first</SelectItem>
          </SelectContent>
        </Select>
        <div className="border-hairline ml-auto flex rounded-sm border">
          <button
            onClick={() => setView("grid")}
            className={`flex h-8 w-8 items-center justify-center ${view === "grid" ? "bg-ink text-on-primary" : "text-mute"}`}
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setView("list")}
            className={`flex h-8 w-8 items-center justify-center ${view === "list" ? "bg-ink text-on-primary" : "text-mute"}`}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="No matches"
          description="Try a different search or status filter."
        />
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              workspaceName={
                showWorkspace ? workspaceName(p.workspaceId) : null
              }
              author={authorOf(p)}
              onOpen={() => open(p)}
              onArchive={() => setArchiveTarget(p)}
            />
          ))}
        </div>
      ) : (
        <ProjectTable
          projects={list}
          showWorkspace={showWorkspace}
          workspaceName={workspaceName}
          onOpen={open}
          onArchive={setArchiveTarget}
        />
      )}

      {archiveTarget && (
        <ArchiveConfirmDialog
          name={archiveTarget.name}
          onClose={() => setArchiveTarget(null)}
          onConfirm={() => void archive(archiveTarget)}
        />
      )}
    </div>
  )
}

// One project card in the grid view, with a star marker and a hover archive button.
// Clicking the card body opens the project.
function ProjectCard({
  project: p,
  workspaceName,
  author,
  onOpen,
  onArchive,
}: {
  project: Project
  workspaceName: string | null
  author: string | null
  onOpen: () => void
  onArchive: () => void
}) {
  return (
    <PageCard className="group hover:border-hairline-strong relative flex h-full flex-col p-4">
      {p.starred && (
        <span className="pointer-events-none absolute top-2 right-2 grid h-6 w-6 place-items-center group-hover:opacity-0">
          <Star className="fill-ink text-ink h-3.5 w-3.5" />
        </span>
      )}
      <button
        onClick={onArchive}
        className="text-mute hover:text-danger hover:bg-surface-soft absolute top-2 right-2 z-10 grid h-6 w-6 place-items-center rounded-sm opacity-0 group-hover:opacity-100"
        aria-label={`Archive ${p.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <div onClick={onOpen} className="flex flex-1 cursor-pointer flex-col">
        <div className="flex items-start justify-between pr-6">
          <h3 className="truncate text-sm font-bold">{p.name}</h3>
        </div>
        <p className="text-body mt-1 line-clamp-2 min-h-[2.5rem] text-xs">
          {p.description ?? p.initialPrompt}
        </p>
        <div className="mt-4 flex items-center justify-between text-[11px]">
          <StatusBadge status={p.status} />
          <span className="text-mute">{formatRelativeTime(p.lastUsed)}</span>
        </div>
        <div className="text-mute mt-auto min-h-[2.125rem] pt-2 text-[11px]">
          {p.stack.join(" / ")}
          {workspaceName !== null && <> · {workspaceName}</>}
          {author && <> · created by {author}</>}
        </div>
      </div>
    </PageCard>
  )
}

// The list view: a table of projects with an archive button per row.
// Clicking a row opens the project.
function ProjectTable({
  projects,
  showWorkspace,
  workspaceName,
  onOpen,
  onArchive,
}: {
  projects: Project[]
  showWorkspace: boolean
  workspaceName: (id: string) => string
  onOpen: (project: Project) => void
  onArchive: (project: Project) => void
}) {
  return (
    <PageCard>
      <table className="w-full text-sm">
        <thead className="text-mute text-[11px] tracking-widest uppercase">
          <tr>
            <th className="px-4 py-2.5 text-left font-normal">Name</th>
            <th className="px-4 py-2.5 text-left font-normal">Prompt</th>
            <th className="px-4 py-2.5 text-left font-normal">Status</th>
            {showWorkspace && (
              <th className="px-4 py-2.5 text-left font-normal">Workspace</th>
            )}
            <th className="px-4 py-2.5 text-left font-normal">Edited</th>
            <th className="px-4 py-2.5 font-normal" />
          </tr>
        </thead>
        <tbody className="divide-hairline divide-y">
          {projects.map((p) => (
            <tr
              key={p.id}
              onClick={() => onOpen(p)}
              className="hover:bg-surface-soft cursor-pointer"
            >
              <td className="px-4 py-2.5 font-medium">{p.name}</td>
              <td className="text-body max-w-md truncate px-4 py-2.5">
                {p.description ?? p.initialPrompt}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={p.status} />
              </td>
              {showWorkspace && (
                <td className="text-mute truncate px-4 py-2.5">
                  {workspaceName(p.workspaceId)}
                </td>
              )}
              <td className="text-mute px-4 py-2.5">
                {formatRelativeTime(p.lastUsed)}
              </td>
              <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onArchive(p)}
                  className="text-mute hover:text-danger"
                  aria-label={`Archive ${p.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageCard>
  )
}

// Small colored label for a project status.
// Used in project cards and tables.
export function StatusBadge({ status }: { status: ProjectStatus }) {
  const tone =
    status === "READY"
      ? "bg-success/15 text-success"
      : status === "BUILDING"
        ? "bg-info/15 text-info"
        : status === "NEEDS_INPUT"
          ? "bg-warning/15 text-warning"
          : "bg-surface-card text-mute"
  return (
    <span
      className={`rounded-sm px-1.5 py-0.5 text-[10px] tracking-widest uppercase ${tone}`}
    >
      {PROJECT_STATUS_LABEL[status]}
    </span>
  )
}
