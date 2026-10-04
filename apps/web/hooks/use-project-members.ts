"use client"

import { useEffect, useState } from "react"

import { listProjectMembersRequest, type ProjectMember } from "@/lib/build"

// Loads everyone on the project (owner and collaborators), once per project.
// Used for the "N active" list and @-mentions in Team chat.
export function useProjectMembers(projectId: string): ProjectMember[] {
  const [loaded, setLoaded] = useState<{
    projectId: string
    members: ProjectMember[]
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    void listProjectMembersRequest(projectId).then((result) => {
      if (!cancelled && result.ok)
        setLoaded({ projectId, members: result.data })
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return loaded?.projectId === projectId ? loaded.members : []
}
