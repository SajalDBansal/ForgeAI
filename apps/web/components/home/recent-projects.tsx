"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { Button } from "@forgeAI/ui/components/button"
import { Badge } from "@forgeAI/ui/components/badge"

import { Bracket } from "@/components/brand/bracket"
import { useSession } from "@/hooks/use-session"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { useAppStore } from "@/lib/store"
import { PROJECT_STATUS_LABEL, formatRelativeTime, type ProjectStatus } from "@/lib/types"

const STATUS_CLASS: Record<ProjectStatus, string> = {
  READY: "bg-surface-card text-ink",
  BUILDING: "bg-ink text-on-primary",
  PLANNING: "bg-surface-soft text-body border border-hairline",
  NEEDS_INPUT: "bg-warning/15 text-ink border border-warning/40",
}

export function RecentProjects() {
  const { session, isPending } = useSession()
  const projects = useAppStore((s) => s.projects)
  const workspaces = useWorkspaces()
  const workspaceName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? id

  const recent = useMemo(
    () =>
      projects
        .filter((p) => !p.archivedAt)
        .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()),
    [projects]
  )

  if (isPending || !session) return null


  return (
    <section className="mt-20">
      <div className="flex items-end justify-between hairline-b pb-2">
        <h2 className="text-base font-bold">Recent projects</h2>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-auto p-0 text-xs text-mute hover:text-ink hover:bg-transparent gap-1"
        >
          <Link href="/projects">
            View all <ChevronRight className="h-3 w-3" />
          </Link>
        </Button>
      </div>
      {recent.length === 0 ? (
        <div className="mt-4 py-8 text-center border border-hairline rounded-sm bg-canvas">
          <p className="text-sm text-body">No projects created till now.</p>
          <p className="mt-1 text-xs text-mute">Describe what you want to build above to create your first one.</p>
        </div>
      ) : (
        <ul className="mt-4 grid sm:grid-cols-2 gap-3">
          {recent.slice(0, 4).map((p) => (
            <li key={p.id} className="h-full">
              <Link
                href={`/${p.id}`}
                className="flex h-full w-full flex-col text-left p-4 border border-hairline rounded-sm hover:border-ink bg-canvas group"
              >
                <div className="flex items-center gap-2 text-sm">
                  <Bracket kind="plus" />
                  <span className="font-medium truncate">{p.name}</span>
                  <Badge className={`ml-auto rounded-sm px-1.5 py-0.5 text-[10px] ${STATUS_CLASS[p.status]}`}>
                    {PROJECT_STATUS_LABEL[p.status]}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-body line-clamp-2">{p.description ?? p.initialPrompt}</p>
                <div className="mt-auto pt-3 flex flex-wrap items-start gap-x-3 text-[11px] text-mute min-h-[2.125rem]">
                  <span>{formatRelativeTime(p.lastUsed)}</span>
                  <span>·</span>
                  <span>{p.stack.join(" / ")}</span>
                  <span>·</span>
                  <span className="truncate">{workspaceName(p.workspaceId)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
