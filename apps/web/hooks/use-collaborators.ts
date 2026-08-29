"use client"

import { useCallback, useEffect, useState } from "react"

import { useSession } from "@/hooks/use-session"
import type { AccountCollaborator } from "@/lib/types"

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL

export function useCollaborators() {
  const { session, isPending } = useSession()
  const userId = session?.user?.id ?? null
  const [collaborators, setCollaborators] = useState<AccountCollaborator[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!userId) {
      setCollaborators([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${AUTH_URL}/api/v1/collaborator`, { credentials: "include" })
      setCollaborators(res.ok ? ((await res.json()) as AccountCollaborator[]) : [])
    } catch {
      setCollaborators([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (isPending) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh, isPending])

  return { collaborators, loading, refresh }
}
