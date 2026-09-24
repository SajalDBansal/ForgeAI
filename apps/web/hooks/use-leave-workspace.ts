"use client"

import { useCallback, useState } from "react"

import { useSession } from "@/hooks/use-session"
import { removeCollaborator } from "@/lib/collaborators"
import { useAppStore } from "@/lib/store"
import { displayToast } from "@/lib/toast"
import type { Workspace } from "@/lib/types"

// Removes the signed-in user from a workspace they collaborate on.
// Uses the remove-collaborator endpoint with their own id, then drops the workspace locally.
export function useLeaveWorkspace() {
  const { session } = useSession()
  const userId = session?.user?.id
  const deleteWorkspace = useAppStore((s) => s.deleteWorkspace)
  const [leaving, setLeaving] = useState(false)

  const leave = useCallback(
    async (workspace: Workspace): Promise<boolean> => {
      if (!userId || leaving) return false
      setLeaving(true)
      const result = await removeCollaborator(workspace.id, userId, "you")
      setLeaving(false)

      if (!result.ok) {
        displayToast(result.message)
        return false
      }

      deleteWorkspace(workspace.id)
      displayToast(`You left "${workspace.name}"`)
      return true
    },
    [userId, leaving, deleteWorkspace],
  )

  return { leave, leaving }
}
