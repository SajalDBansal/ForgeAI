"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"

import { Skeleton } from "@forgeAI/ui/components/skeleton"

import { PageCard } from "@/components/layout/page-card"
import { SupabaseIcon } from "@/components/brand/supabase-icon"
import { displayToast } from "@/lib/toast"

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL

interface SupabaseProject {
  id: string
  name: string
  region: string
  status: string
  createdAt: string
}

interface SupabaseDetails {
  organizationId: string
  organizationName: string
  connectedAt: string
  projects: SupabaseProject[]
}

export function SupabaseView() {
  const router = useRouter()
  const [details, setDetails] = useState<SupabaseDetails | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${AUTH_URL}/api/v1/connections/supabase`, { credentials: "include" })
      setDetails(res.ok ? ((await res.json()) as SupabaseDetails) : null)
    } catch {
      setDetails(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const disconnect = async () => {
    const res = await fetch(`${AUTH_URL}/api/v1/connections/supabase`, {
      method: "DELETE",
      credentials: "include",
    })
    if (res.ok) {
      displayToast("Disconnected Supabase")
      router.push("/connections")
    } else {
      displayToast("Couldn't disconnect Supabase")
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <PageCard className="p-5">
          <div className="flex items-start gap-4">
            <Skeleton className="h-12 w-12 rounded-sm bg-surface-card shrink-0" />
            <div className="flex-1 min-w-0 space-y-2 py-0.5">
              <Skeleton className="h-4 w-32 rounded-sm bg-surface-card" />
              <Skeleton className="h-3 w-48 rounded-sm bg-surface-card" />
            </div>
            <Skeleton className="h-9 w-24 rounded-sm bg-surface-card shrink-0" />
          </div>
        </PageCard>

        <PageCard className="p-5">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-3 w-28 rounded-sm bg-surface-card" />
            <Skeleton className="h-3 w-14 rounded-sm bg-surface-card" />
          </div>
          <ul className="divide-y divide-hairline -mx-2">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="px-2 py-3 flex items-center gap-3">
                <Skeleton className="h-4 w-4 rounded-sm bg-surface-card shrink-0" />
                <div className="flex-1 min-w-0 space-y-2 py-0.5">
                  <Skeleton className="h-3.5 w-40 rounded-sm bg-surface-card" />
                  <Skeleton className="h-3 w-56 rounded-sm bg-surface-card" />
                </div>
              </li>
            ))}
          </ul>
        </PageCard>
      </div>
    )
  }

  if (!details) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <PageCard className="p-6 text-center">
          <p className="text-sm text-body">Supabase is not connected yet.</p>
          <a
            href={`${AUTH_URL}/api/v1/connections/supabase/start`}
            className="mt-3 inline-flex h-9 px-4 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep items-center"
          >
            Connect Supabase
          </a>
        </PageCard>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <PageCard className="p-5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-sm bg-ink flex items-center justify-center shrink-0">
            <SupabaseIcon className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-bold truncate">{details.organizationName}</h2>
              <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-success/15 text-success shrink-0">
                Connected
              </span>
            </div>
            <p className="mt-1 text-sm text-body">
              Organization · connected {new Date(details.connectedAt).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={disconnect}
            className="h-9 px-4 rounded-sm text-sm font-medium border border-hairline hover:bg-surface-soft shrink-0"
          >
            Disconnect
          </button>
        </div>
      </PageCard>

      <PageCard className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] uppercase tracking-widest text-mute">Projects · {details.projects.length}</h2>
          <button
            onClick={() => void load()}
            className="text-xs inline-flex items-center gap-1 hover:text-ink text-mute"
          >
            <RefreshCw className="h-3 w-3" /> Resync
          </button>
        </div>
        <ul className="divide-y divide-hairline -mx-2">
          {details.projects.map((p) => (
            <li key={p.id} className="px-2 py-3 flex items-center gap-3">
              <SupabaseIcon className="h-4 w-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-[11px] text-mute flex items-center gap-2">
                  <span>{p.region}</span>
                  <span>·</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-sm text-[10px] uppercase tracking-widest ${p.status === "ACTIVE_HEALTHY" ? "bg-success/15 text-success" : "bg-surface-card text-mute"
                      }`}
                  >
                    {p.status}
                  </span>
                  <span>·</span>
                  <span>created {new Date(p.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </li>
          ))}
          {details.projects.length === 0 && (
            <li className="px-2 py-6 text-sm text-mute text-center">No projects found.</li>
          )}
        </ul>
      </PageCard>
    </div>
  )
}
