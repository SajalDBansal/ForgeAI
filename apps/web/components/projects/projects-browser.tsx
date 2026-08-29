"use client"

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Filter, FolderGit2, Grid3x3, List, Search, Star, Trash2 } from "lucide-react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@forgeAI/ui/components/select"

import { PageCard } from "@/components/layout/page-card"
import { EmptyState } from "@/components/layout/empty-state"
import { ArchiveConfirmDialog } from "@/components/shared/archive-confirm-dialog"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useAppStore } from "@/lib/store"
import { formatRelativeTime, type Project } from "@/lib/types"
import { displayToast } from "@/lib/toast"

const STATUSES = ["All", "Ready", "Building", "Planning", "Needs input"]
type SortKey = "used" | "created" | "starred"

export function ProjectsBrowser({
  projects,
  showWorkspace = false,
  emptyAction,
}: {
  projects: Project[]
  showWorkspace?: boolean
  emptyAction?: ReactNode
}) {
  const router = useRouter()
  const workspaces = useWorkspaces()
  const archiveProject = useAppStore((s) => s.archiveProject)
  const metadataStatus = useAppStore((s) => s.metadataStatus)
  const [q, setQ] = useState("")
  const [view, setView] = useState<"grid" | "list">("grid")
  const [status, setStatus] = useState<string>("All")
  const [sort, setSort] = useState<SortKey>("used")
  const [archiveTarget, setArchiveTarget] = useState<Project | null>(null)

  const workspaceName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? id

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

  const list = activeProjects
    .filter(
      (p) =>
        (status === "All" || p.status === status) &&
        (!q ||
          p.name.includes(q.toLowerCase()) ||
          (p.initialPrompt ?? "").toLowerCase().includes(q.toLowerCase()))
    )
    .sort((a, b) => {
      if (sort === "created")
        return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
      if (sort === "starred") return Number(b.starred ?? false) - Number(a.starred ?? false)
      return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter projects…"
            className="w-full h-9 bg-surface-soft pl-8 pr-3 text-sm rounded-sm border border-hairline focus:outline-none focus:border-ink"
          />
        </div>
        <div className="flex items-center gap-1 text-sm">
          <Filter className="h-3.5 w-3.5 text-mute mr-1.5" />
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`h-8 px-3 rounded-sm text-xs ${status === s ? "bg-ink text-on-primary" : "text-mute hover:text-ink"
                }`}
            >
              {s}
            </button>
          ))}
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger size="sm" className="h-8 rounded-sm border-hairline bg-canvas text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="used">Recently used</SelectItem>
            <SelectItem value="created">Recently created</SelectItem>
            <SelectItem value="starred">Starred first</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex border border-hairline rounded-sm">
          <button
            onClick={() => setView("grid")}
            className={`h-8 w-8 flex items-center justify-center ${view === "grid" ? "bg-ink text-on-primary" : "text-mute"}`}
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setView("list")}
            className={`h-8 w-8 flex items-center justify-center ${view === "list" ? "bg-ink text-on-primary" : "text-mute"}`}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState title="No matches" description="Try a different search or status filter." />
      ) : view === "grid" ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((p) => (
            <PageCard key={p.id} className="relative group p-4 hover:border-hairline-strong h-full flex flex-col">
              {p.starred && (
                <span className="absolute top-2 right-2 h-6 w-6 grid place-items-center group-hover:opacity-0 pointer-events-none">
                  <Star className="h-3.5 w-3.5 fill-ink text-ink" />
                </span>
              )}
              <button
                onClick={() => setArchiveTarget(p)}
                className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 h-6 w-6 grid place-items-center text-mute hover:text-danger rounded-sm hover:bg-surface-soft"
                aria-label={`Archive ${p.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <div onClick={() => router.push(`/${p.id}`)} className="cursor-pointer flex-1 flex flex-col">
                <div className="flex items-start justify-between pr-6">
                  <h3 className="font-bold text-sm truncate">{p.name}</h3>
                </div>
                <p className="mt-1 text-xs text-body line-clamp-2 min-h-[2.5rem]">
                  {p.description ?? p.initialPrompt}
                </p>
                <div className="mt-4 flex items-center justify-between text-[11px]">
                  <StatusBadge status={p.status} />
                  <span className="text-mute">{formatRelativeTime(p.lastUsed)}</span>
                </div>
                <div className="mt-auto pt-2 text-[11px] text-mute min-h-[2.125rem]">
                  {p.stack.join(" / ")}
                  {showWorkspace && <> · {workspaceName(p.workspaceId)}</>}
                </div>
              </div>
            </PageCard>
          ))}
        </div>
      ) : (
        <PageCard>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-widest text-mute">
              <tr>
                <th className="text-left px-4 py-2.5 font-normal">Name</th>
                <th className="text-left px-4 py-2.5 font-normal">Prompt</th>
                <th className="text-left px-4 py-2.5 font-normal">Status</th>
                {showWorkspace && <th className="text-left px-4 py-2.5 font-normal">Workspace</th>}
                <th className="text-left px-4 py-2.5 font-normal">Edited</th>
                <th className="px-4 py-2.5 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {list.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/${p.id}`)}
                  className="hover:bg-surface-soft cursor-pointer"
                >
                  <td className="px-4 py-2.5 font-medium">{p.name}</td>
                  <td className="px-4 py-2.5 text-body truncate max-w-md">{p.description ?? p.initialPrompt}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={p.status} />
                  </td>
                  {showWorkspace && (
                    <td className="px-4 py-2.5 text-mute truncate">{workspaceName(p.workspaceId)}</td>
                  )}
                  <td className="px-4 py-2.5 text-mute">{formatRelativeTime(p.lastUsed)}</td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setArchiveTarget(p)}
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
      )}

      {archiveTarget && (
        <ArchiveConfirmDialog
          name={archiveTarget.name}
          onClose={() => setArchiveTarget(null)}
          onConfirm={() => {
            archiveProject(archiveTarget.id)
            displayToast(`Archived "${archiveTarget.name}"`)
          }}
        />
      )}
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "Ready"
      ? "bg-success/15 text-success"
      : status === "Building"
        ? "bg-info/15 text-info"
        : status === "Needs input"
          ? "bg-warning/15 text-warning"
          : "bg-surface-card text-mute"
  return (
    <span className={`px-1.5 py-0.5 rounded-sm text-[10px] uppercase tracking-widest ${tone}`}>
      {status}
    </span>
  )
}
