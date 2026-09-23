"use client"

import { useCallback } from "react"

import { useAppStore } from "@/lib/store"
import type { AccountCollaborator } from "@/lib/types"
import { PUBLIC_ENV } from "@/lib/env"

const AUTH_URL = PUBLIC_ENV.AUTH_URL

// Returns everyone sharing a workspace with this account, read from the store (no fetch on mount).
// `refresh` re-reads the list after an invite, removal or role change.
export function useCollaborators(): {
  collaborators: AccountCollaborator[]
  loading: boolean
  refresh: () => Promise<void>
} {
  const collaborators = useAppStore((s) => s.collaborators)
  const metadataStatus = useAppStore((s) => s.metadataStatus)
  const setCollaborators = useAppStore((s) => s.setCollaborators)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${AUTH_URL}/api/v1/collaborator`, {
        credentials: "include",
      })
      if (res.ok) setCollaborators((await res.json()) as AccountCollaborator[])
    } catch {
      // Keep the current list; the next load corrects it.
    }
  }, [setCollaborators])

  return { collaborators, loading: metadataStatus !== "loaded", refresh }
}
