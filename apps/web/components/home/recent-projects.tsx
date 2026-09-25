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
import {
  PROJECT_STATUS_LABEL,
  formatRelativeTime,
  type ProjectStatus,
} from "@/lib/types"

const STATUS_CLASS: Record<ProjectStatus, string> = {
  READY: "bg-surface-card text-ink",
  BUILDING: "bg-ink text-on-primary",
  PLANNING: "bg-surface-soft text-body border border-hairline",
  NEEDS_INPUT: "bg-warning/15 text-ink border border-warning/40",
}

// Home page section showing the four most recently used projects.
// Hidden for signed-out visitors.
export function RecentProjects() {
  const { session, isPending } = useSession()
  const projects = useAppStore((s) => s.projects)
  const workspaces = useWorkspaces()
  const workspaceName = (id: string) =>
    workspaces.find((w) => w.id === id)?.name ?? id

  const recent = useMemo(
    () =>
      projects
        .filter((p) => !p.archivedAt)
        .sort(
          (a, b) =>
            new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime(),
        ),
    [projects],
  )

  if (isPending || !session) return null

  return (
    <section className="mt-20">
      <div className="hairline-b flex items-end justify-between pb-2">
        <h2 className="text-base font-bold">Recent projects</h2>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-mute hover:text-ink h-auto gap-1 p-0 text-xs hover:bg-transparent"
        >
          <Link href="/projects">
            View all <ChevronRight className="h-3 w-3" />
          </Link>
        </Button>
      </div>
      {recent.length === 0 ? (
        <div className="border-hairline bg-canvas mt-4 rounded-sm border py-8 text-center">
          <p className="text-body text-sm">No projects created till now.</p>
          <p className="text-mute mt-1 text-xs">
            Describe what you want to build above to create your first one.
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {recent.slice(0, 4).map((p) => (
            <li key={p.id} className="h-full">
              <Link
                href={`/${p.id}`}
                className="border-hairline hover:border-ink bg-canvas group flex h-full w-full flex-col rounded-sm border p-4 text-left"
              >
                <div className="flex items-center gap-2 text-sm">
                  <Bracket kind="plus" />
                  <span className="truncate font-medium">{p.name}</span>
                  <Badge
                    className={`ml-auto rounded-sm px-1.5 py-0.5 text-[10px] ${STATUS_CLASS[p.status]}`}
                  >
                    {PROJECT_STATUS_LABEL[p.status]}
                  </Badge>
                </div>
                <p className="text-body mt-2 line-clamp-2 text-sm">
                  {p.description ?? p.initialPrompt}
                </p>
                <div className="text-mute mt-auto flex min-h-[2.125rem] flex-wrap items-start gap-x-3 pt-3 text-[11px]">
                  <span>{formatRelativeTime(p.lastUsed)}</span>
                  <span>·</span>
                  <span>{p.stack.join(" / ")}</span>
                  <span>·</span>
                  <span className="truncate">
                    {workspaceName(p.workspaceId)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
