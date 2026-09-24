"use client"

import { useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { mapAppMetadata, type RawAppMetadata } from "@/lib/app-metadata"
import { takePendingInvite } from "@/lib/invite"
import { useAppStore } from "@/lib/store"
import type { TemplateListItem } from "@/lib/types"
import { PUBLIC_ENV } from "@/lib/env"

const AUTH_URL = PUBLIC_ENV.AUTH_URL

// Fetches JSON from an API path with the session cookie, or null on any failure.
// Used for the app's first metadata and template loads.
async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${AUTH_URL}/api/v1${path}`, {
      credentials: "include",
    })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

// Loads the signed-in user's workspaces, projects, collaborators and templates into the store.
// Also resumes a pending invite after any kind of sign-in.
export function AppMetadataProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const userId = session?.user.id ?? null
  const startMetadataLoad = useAppStore((s) => s.startMetadataLoad)
  const setAppMetadata = useAppStore((s) => s.setAppMetadata)
  const clearAppMetadata = useAppStore((s) => s.clearAppMetadata)
  const setTemplates = useAppStore((s) => s.setTemplates)

  // Every sign-in path passes through here, so resume a pending invite (consumed once).
  useEffect(() => {
    if (isPending || !userId) return
    const token = takePendingInvite()
    if (token) router.push(`/invite/${token}`)
  }, [isPending, userId, router])

  useEffect(() => {
    if (isPending) return

    if (!userId) {
      clearAppMetadata()
      return
    }

    let cancelled = false
    startMetadataLoad()
    void fetchJson<RawAppMetadata>("/metadata/user").then((raw) => {
      if (raw && !cancelled) setAppMetadata(mapAppMetadata(raw))
    })

    void fetchJson<TemplateListItem[]>("/template").then((templates) => {
      if (templates && !cancelled) setTemplates(templates)
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isPending])

  return children
}
