"use client"

import { useCallback } from "react"

import { useSession } from "@/hooks/use-session"
import { useAppStore } from "@/lib/store"
import type { Project, Workspace } from "@/lib/types"

// Returns helpers that check whether the signed-in user owns a workspace or project.
// Mirrors the server's owner-only rules so the UI can hide actions up front.
export function useIsOwner() {
  const { session } = useSession()
  const userId = session?.user?.id
  const workspaces = useAppStore((s) => s.workspaces)

  const ownsWorkspace = useCallback(
    (workspace: Pick<Workspace, "userId">) =>
      !!userId && workspace.userId === userId,
    [userId],
  )

  const ownsProject = useCallback(
    (project: Pick<Project, "workspaceId">) => {
      if (!userId) return false
      const workspace = workspaces.find((w) => w.id === project.workspaceId)
      // A workspace we cannot see at all is not one we own.
      return !!workspace && workspace.userId === userId
    },
    [userId, workspaces],
  )

  return { ownsWorkspace, ownsProject }
}
