"use client"

import { useCallback, useEffect, useState } from "react"

export interface Connection {
  provider: "GITHUB" | "VERCEL" | "RENDER" | "SUPABASE"
  status: "CONNECTED" | "EXPIRED" | "REVOKED"
  externalAccountLogin: string
  updatedAt: string
}

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL

export function useConnections() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${AUTH_URL}/api/v1/connections`, { credentials: "include" })
      setConnections(res.ok ? ((await res.json()) as Connection[]) : [])
    } catch {
      setConnections([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  return { connections, loading, refresh }
}
