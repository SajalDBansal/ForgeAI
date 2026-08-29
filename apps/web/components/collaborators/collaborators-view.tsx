"use client"

import { useState } from "react"
import Link from "next/link"
import { Users } from "lucide-react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@forgeAI/ui/components/select"
import { Skeleton } from "@forgeAI/ui/components/skeleton"

import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { EmptyState } from "@/components/layout/empty-state"
import { useCollaborators } from "@/hooks/use-collaborators"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { collaboratorInitials } from "@/lib/types"

export function CollaboratorsView() {
  const workspaces = useWorkspaces()
  const { collaborators: allCollaborators, loading } = useCollaborators()
  const [workspaceFilter, setWorkspaceFilter] = useState("All")

  const workspaceName = (id: string, fallback: string) =>
    workspaces.find((w) => w.id === id)?.name ?? fallback

  const collaborators = allCollaborators.filter(
    (c) => workspaceFilter === "All" || c.workspaceId === workspaceFilter
  )

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <PageCard className="p-5">
        <SectionHeader label="Workspace" hint="Filter collaborators by the workspace they're part of" />
        <Select value={workspaceFilter} onValueChange={setWorkspaceFilter}>
          <SelectTrigger className="w-full h-10 rounded-sm border-hairline bg-canvas text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All workspaces</SelectItem>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageCard>

      <PageCard className="p-5">
        <SectionHeader
          label={`Collaborators · ${collaborators.length}`}
          hint="To invite or remove someone, open their workspace"
        />
        {loading ? (
          <ul className="divide-y divide-hairline -mx-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="px-2 py-3 flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-sm shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </li>
            ))}
          </ul>
        ) : collaborators.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="No collaborators yet"
            description="There is no collaborator available for you right now."
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
                  <div className="text-xs text-mute flex items-center gap-1.5">
                    <span className="truncate">{c.user.email}</span>
                    <span className="shrink-0">·</span>
                    <Link href={`/workspaces/${c.workspaceId}`} className="shrink-0 truncate hover:text-ink">
                      {workspaceName(c.workspaceId, c.workspaceName)}
                    </Link>
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-widest text-mute px-2 py-1 bg-surface-card rounded-sm shrink-0">
                  {c.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PageCard>
    </div>
  )
}
