"use client"

import { useCallback } from "react"

import { useCollaborators } from "@/hooks/use-collaborators"
import { useSession } from "@/hooks/use-session"

// Returns a function that turns a user id into "you", a collaborator's name, or "Someone else".
// Used for terminal drivers, dev-server starters and other multi-user labels.
export function useUserName(): (
  userId: string | null | undefined,
) => string | null {
  const { session } = useSession()
  const myUserId = session?.user?.id
  const { collaborators } = useCollaborators()

  return useCallback(
    (userId) => {
      if (!userId) return null
      if (userId === myUserId) return "you"
      return (
        collaborators.find((c) => c.user.id === userId)?.user.name ??
        "Someone else"
      )
    },
    [collaborators, myUserId],
  )
}
