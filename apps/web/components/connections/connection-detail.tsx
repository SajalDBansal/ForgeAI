"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { Skeleton } from "@forgeAI/ui/components/skeleton"

import { PageCard } from "@/components/layout/page-card"
import { displayToast } from "@/lib/toast"
import { PUBLIC_ENV } from "@/lib/env"

const AUTH_URL = PUBLIC_ENV.AUTH_URL

/** Class names for the primary "Connect X" action on a not-connected card. */
export const connectActionClass =
  "mt-3 inline-flex h-9 px-4 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep items-center"

// Loads a provider connection's details (account plus resources); null when not connected.
// Shared by every provider's detail page; `load` doubles as "Resync".
export function useConnectionDetails<T>(slug: string) {
  const [details, setDetails] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${AUTH_URL}/api/v1/connections/${slug}`, {
        credentials: "include",
      })
      setDetails(res.ok ? ((await res.json()) as T) : null)
    } catch {
      setDetails(null)
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return { details, loading, load }
}

// Returns a function that disconnects the provider and goes back to Connections.
// Shows a toast either way.
export function useDisconnect(slug: string, name: string) {
  const router = useRouter()
  return async () => {
    const res = await fetch(`${AUTH_URL}/api/v1/connections/${slug}`, {
      method: "DELETE",
      credentials: "include",
    })
    if (res.ok) {
      displayToast(`Disconnected ${name}`)
      router.push("/connections")
    } else {
      displayToast(`Couldn't disconnect ${name}`)
    }
  }
}

// Placeholder shown while a provider's details load.
// Mirrors the account card plus resource list layout.
export function ConnectionDetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageCard className="p-5">
        <div className="flex items-start gap-4">
          <Skeleton className="bg-surface-card h-12 w-12 shrink-0 rounded-sm" />
          <div className="min-w-0 flex-1 space-y-2 py-0.5">
            <Skeleton className="bg-surface-card h-4 w-32 rounded-sm" />
            <Skeleton className="bg-surface-card h-3 w-48 rounded-sm" />
          </div>
          <Skeleton className="bg-surface-card h-9 w-24 shrink-0 rounded-sm" />
        </div>
      </PageCard>

      <PageCard className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="bg-surface-card h-3 w-28 rounded-sm" />
          <Skeleton className="bg-surface-card h-3 w-14 rounded-sm" />
        </div>
        <ul className="divide-hairline -mx-2 divide-y">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-3 px-2 py-3">
              <Skeleton className="bg-surface-card h-4 w-4 shrink-0 rounded-sm" />
              <div className="min-w-0 flex-1 space-y-2 py-0.5">
                <Skeleton className="bg-surface-card h-3.5 w-40 rounded-sm" />
                <Skeleton className="bg-surface-card h-3 w-56 rounded-sm" />
              </div>
            </li>
          ))}
        </ul>
      </PageCard>
    </div>
  )
}

// Card shown on a provider page when the provider isn't connected yet.
// `children` is the connect action (a link or a button); `extra` renders after the card.
export function NotConnectedCard({
  name,
  children,
  extra,
}: {
  name: string
  children: ReactNode
  extra?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <PageCard className="p-6 text-center">
        <p className="text-body text-sm">{name} is not connected yet.</p>
        {children}
      </PageCard>
      {extra}
    </div>
  )
}

// Link that starts a provider's OAuth/install flow on the API.
// Used as the connect action for GitHub, Vercel and Supabase.
export function ConnectLink({ slug, name }: { slug: string; name: string }) {
  return (
    <a
      href={`${AUTH_URL}/api/v1/connections/${slug}/start`}
      className={connectActionClass}
    >
      Connect {name}
    </a>
  )
}
