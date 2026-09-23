"use client"

import { useCollaborators } from "@/hooks/use-collaborators"
import { useIsOwner } from "@/hooks/use-is-owner"
import { useSession } from "@/hooks/use-session"
import { useWorkspaces } from "@/hooks/use-workspaces"

/** The signed-in user's role in a workspace; null while loading or when they can't see it. */
export type WorkspaceRole = "OWNER" | "EDITOR" | "VIEWER" | null

export const WORKSPACE_ROLE_LABEL: Record<
  Exclude<WorkspaceRole, null>,
  string
> = {
  OWNER: "Owner",
  EDITOR: "Editor",
  VIEWER: "Viewer",
}

// Works out the user's role in a workspace from its owner id and the collaborator list.
// Used to label roles and disable controls; the server still enforces the rules.
export function useWorkspaceRole(
  workspaceId: string | undefined,
): WorkspaceRole {
  const { session } = useSession()
  const { ownsWorkspace } = useIsOwner()
  const { collaborators } = useCollaborators()
  const workspaces = useWorkspaces({ includeArchived: true })

  if (!workspaceId) return null
  const userId = session?.user?.id
  if (!userId) return null

  const workspace = workspaces.find((w) => w.id === workspaceId)
  if (!workspace) return null
  if (ownsWorkspace(workspace)) return "OWNER"

  const mine = collaborators.find(
    (c) => c.workspaceId === workspaceId && c.user.id === userId,
  )
  return mine?.role ?? null
}

// Checks whether a role may add projects (owner and editors).
// Viewers can look but not create.
export function canContribute(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "EDITOR"
}
