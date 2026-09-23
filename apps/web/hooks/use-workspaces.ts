"use client"

import { useMemo } from "react"

import { useSession } from "@/hooks/use-session"
import { useAppStore } from "@/lib/store"
import { resolveWorkspaceName, type Workspace } from "@/lib/types"

// Returns the user's workspaces with display names, hiding archived ones unless asked.
// The base workspace is shown as "<first name>'s projects".
export function useWorkspaces(opts?: {
  includeArchived?: boolean
}): Workspace[] {
  const { session } = useSession()
  const firstName = session?.user?.name?.trim().split(/\s+/)[0]
  const workspaces = useAppStore((s) => s.workspaces)
  const includeArchived = opts?.includeArchived ?? false

  return useMemo(
    () =>
      workspaces
        .filter((w) => includeArchived || !w.archivedAt)
        .map((w) => ({ ...w, name: resolveWorkspaceName(w, firstName) })),
    [workspaces, firstName, includeArchived],
  )
}
