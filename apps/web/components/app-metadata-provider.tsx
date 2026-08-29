"use client"

import { useEffect, type ReactNode } from "react"
import { authClient } from "@/lib/auth-client"
import { mapAppMetadata, type RawAppMetadata } from "@/lib/app-metadata"
import { useAppStore } from "@/lib/store"
import type { TemplateListItem } from "@/lib/types"

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL

export function AppMetadataProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession()
  const userId = session?.user.id ?? null
  const startMetadataLoad = useAppStore((s) => s.startMetadataLoad)
  const setAppMetadata = useAppStore((s) => s.setAppMetadata)
  const clearAppMetadata = useAppStore((s) => s.clearAppMetadata)
  const setTemplates = useAppStore((s) => s.setTemplates)

  useEffect(() => {
    if (isPending) return

    if (!userId) {
      clearAppMetadata()
      return
    }

    let cancelled = false
    startMetadataLoad()
    void (async () => {
      try {
        const res = await fetch(`${AUTH_URL}/api/v1/metadata/user`, { credentials: "include" })
        if (!res.ok || cancelled) return
        const raw = (await res.json()) as RawAppMetadata
        if (!cancelled) setAppMetadata(mapAppMetadata(raw))
      } catch {}
    })()

    void (async () => {
      try {
        const res = await fetch(`${AUTH_URL}/api/v1/template`, { credentials: "include" })
        if (!res.ok || cancelled) return
        const templates = (await res.json()) as TemplateListItem[]
        if (!cancelled) setTemplates(templates)
      } catch {}
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isPending])

  return children
}
