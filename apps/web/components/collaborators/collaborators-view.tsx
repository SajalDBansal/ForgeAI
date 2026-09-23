"use client"

import { useState } from "react"
import Link from "next/link"
import { Users } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@forgeAI/ui/components/select"
import { Skeleton } from "@forgeAI/ui/components/skeleton"

import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { EmptyState } from "@/components/layout/empty-state"
import { useCollaborators } from "@/hooks/use-collaborators"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { collaboratorInitials } from "@/lib/types"

// Lists everyone you share a workspace with, filterable by workspace.
// Read-only; invites and removals happen on the workspace page.
export function CollaboratorsView() {
  const workspaces = useWorkspaces()
  const { collaborators: allCollaborators, loading } = useCollaborators()
  const [workspaceFilter, setWorkspaceFilter] = useState("All")

  // Looks up a workspace's display name, falling back to the stored one.
  // Keeps the base workspace shown as "<name>'s projects".
  const workspaceName = (id: string, fallback: string) =>
    workspaces.find((w) => w.id === id)?.name ?? fallback

  const collaborators = allCollaborators.filter(
    (c) => workspaceFilter === "All" || c.workspaceId === workspaceFilter,
  )

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageCard className="p-5">
        <SectionHeader
          label="Workspace"
          hint="Filter collaborators by the workspace they're part of"
        />
        <Select value={workspaceFilter} onValueChange={setWorkspaceFilter}>
          <SelectTrigger className="border-hairline bg-canvas h-10 w-full rounded-sm text-sm">
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
          <ul className="divide-hairline -mx-2 divide-y">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 px-2 py-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-sm" />
                <div className="min-w-0 flex-1 space-y-1.5">
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
          <ul className="divide-hairline -mx-2 divide-y">
            {collaborators.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-2 py-3">
                <div className="bg-ink text-on-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-sm font-bold">
                  {collaboratorInitials(c.user.name, c.user.email)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {c.user.name}
                  </div>
                  <div className="text-mute flex items-center gap-1.5 text-xs">
                    <span className="truncate">{c.user.email}</span>
                    <span className="shrink-0">·</span>
                    <Link
                      href={`/workspaces/${c.workspaceId}`}
                      className="hover:text-ink shrink-0 truncate"
                    >
                      {workspaceName(c.workspaceId, c.workspaceName)}
                    </Link>
                  </div>
                </div>
                <span className="text-mute bg-surface-card shrink-0 rounded-sm px-2 py-1 text-[10px] tracking-widest uppercase">
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
