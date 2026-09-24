"use client"

import { useCallback } from "react"

import {
  archiveProjectRequest,
  deleteProjectRequest,
  restoreProjectRequest,
} from "@/lib/projects"
import { useAppStore } from "@/lib/store"
import { displayToast } from "@/lib/toast"
import type { Project } from "@/lib/types"

// Optimistic archive/restore/delete for projects, rolled back if the API refuses.
// The success toast waits for the server so a refusal never shows two contradictory toasts.
export function useProjectActions() {
  const addProject = useAppStore((s) => s.addProject)
  const updateProject = useAppStore((s) => s.updateProject)
  const archiveProject = useAppStore((s) => s.archiveProject)
  const restoreProject = useAppStore((s) => s.restoreProject)
  const deleteProject = useAppStore((s) => s.deleteProject)

  const archive = useCallback(
    async (project: Project) => {
      archiveProject(project.id)

      const result = await archiveProjectRequest(project.id)
      if (!result.ok) {
        updateProject(project.id, { archivedAt: null })
        displayToast(result.message)
        return
      }

      updateProject(project.id, { archivedAt: result.data.archivedAt })
      displayToast(`Archived "${project.name}"`)
    },
    [archiveProject, updateProject],
  )

  const restore = useCallback(
    async (project: Project) => {
      const archivedAt = project.archivedAt
      restoreProject(project.id)

      const result = await restoreProjectRequest(project.id)
      if (!result.ok) {
        updateProject(project.id, { archivedAt })
        displayToast(result.message)
        return
      }

      displayToast(`Restored "${project.name}"`)
    },
    [restoreProject, updateProject],
  )

  const remove = useCallback(
    async (project: Project) => {
      const removed = deleteProject(project.id)
      if (!removed) return

      const result = await deleteProjectRequest(project.id)
      if (!result.ok) {
        addProject(removed)
        displayToast(result.message)
        return
      }

      displayToast(`Deleted "${project.name}"`)
    },
    [addProject, deleteProject],
  )

  return { archive, restore, remove }
}
