"use client"

import { useCallback } from "react"

import { useIdempotencyKey } from "@/hooks/use-idempotency-key"
import { isInProgress } from "@/lib/api-client"
import { useAppStore } from "@/lib/store"
import { displayToast } from "@/lib/toast"
import type { Workspace } from "@/lib/types"
import {
  archiveWorkspaceRequest,
  createWorkspaceRequest,
  deleteWorkspaceRequest,
  restoreWorkspaceRequest,
} from "@/lib/workspaces"

// Optimistic create/archive/restore/delete for workspaces, rolled back if the API refuses.
// Deleting also restores the workspace's projects on failure.
export function useWorkspaceActions() {
  const createWorkspace = useAppStore((s) => s.createWorkspace)
  const addWorkspace = useAppStore((s) => s.addWorkspace)
  const updateWorkspace = useAppStore((s) => s.updateWorkspace)
  const replaceWorkspace = useAppStore((s) => s.replaceWorkspace)
  const archiveWorkspace = useAppStore((s) => s.archiveWorkspace)
  const restoreWorkspace = useAppStore((s) => s.restoreWorkspace)
  const deleteWorkspace = useAppStore((s) => s.deleteWorkspace)
  const addProject = useAppStore((s) => s.addProject)
  const idempotency = useIdempotencyKey()

  const create = useCallback(
    async (name: string): Promise<Workspace | null> => {
      const optimistic = createWorkspace(name)

      const result = await createWorkspaceRequest(name, idempotency.key(name))
      if (!result.ok) {
        deleteWorkspace(optimistic.id)
        if (!isInProgress(result)) displayToast(result.message)
        return null
      }
      idempotency.renew()

      // Swap the placeholder for the server row (real id).
      replaceWorkspace(optimistic.id, result.data)
      displayToast(`Created workspace "${result.data.name}"`)
      return result.data
    },
    [createWorkspace, deleteWorkspace, idempotency, replaceWorkspace],
  )

  const archive = useCallback(
    async (workspace: Workspace) => {
      archiveWorkspace(workspace.id)

      const result = await archiveWorkspaceRequest(workspace.id)
      if (!result.ok) {
        updateWorkspace(workspace.id, { archivedAt: null })
        displayToast(result.message)
        return
      }

      updateWorkspace(workspace.id, { archivedAt: result.data.archivedAt })
      displayToast(`Archived "${workspace.name}"`)
    },
    [archiveWorkspace, updateWorkspace],
  )

  const restore = useCallback(
    async (workspace: Workspace) => {
      const archivedAt = workspace.archivedAt
      restoreWorkspace(workspace.id)

      const result = await restoreWorkspaceRequest(workspace.id)
      if (!result.ok) {
        updateWorkspace(workspace.id, { archivedAt })
        displayToast(result.message)
        return
      }

      displayToast(`Restored "${workspace.name}"`)
    },
    [restoreWorkspace, updateWorkspace],
  )

  const remove = useCallback(
    async (workspace: Workspace) => {
      const removed = deleteWorkspace(workspace.id)
      if (!removed) return

      const result = await deleteWorkspaceRequest(workspace.id)
      if (!result.ok) {
        addWorkspace(removed.workspace)
        removed.projects.forEach(addProject)
        displayToast(result.message)
        return
      }

      displayToast(`Deleted "${workspace.name}"`)
    },
    [addProject, addWorkspace, deleteWorkspace],
  )

  return { create, archive, restore, remove }
}
