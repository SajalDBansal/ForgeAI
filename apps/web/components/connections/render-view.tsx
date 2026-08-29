"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, RefreshCw } from "lucide-react"

import { Skeleton } from "@forgeAI/ui/components/skeleton"

import { PageCard } from "@/components/layout/page-card"
import { RenderIcon } from "@/components/brand/render-icon"
import { RenderConnectDialog } from "@/components/connections/render-connect-dialog"
import { displayToast } from "@/lib/toast"

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL

interface RenderService {
  id: string
  name: string
  type: string
  url: string | null
  updatedAt: string
}

interface RenderDetails {
  ownerName: string
  connectedAt: string
  services: RenderService[]
}

export function RenderView() {
  const router = useRouter()
  const [details, setDetails] = useState<RenderDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [connectOpen, setConnectOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${AUTH_URL}/api/v1/connections/render`, { credentials: "include" })
      setDetails(res.ok ? ((await res.json()) as RenderDetails) : null)
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
    const res = await fetch(`${AUTH_URL}/api/v1/connections/render`, {
      method: "DELETE",
      credentials: "include",
    })
    if (res.ok) {
      displayToast("Disconnected Render")
      router.push("/connections")
    } else {
      displayToast("Couldn't disconnect Render")
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
          <p className="text-sm text-body">Render is not connected yet.</p>
          <button
            onClick={() => setConnectOpen(true)}
            className="mt-3 inline-flex h-9 px-4 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep items-center"
          >
            Connect Render
          </button>
        </PageCard>

        {connectOpen && (
          <RenderConnectDialog onClose={() => setConnectOpen(false)} onConnected={() => void load()} />
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <PageCard className="p-5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-sm bg-ink text-on-primary flex items-center justify-center shrink-0">
            <RenderIcon className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-bold truncate">{details.ownerName}</h2>
              <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-success/15 text-success shrink-0">
                Connected
              </span>
            </div>
            <p className="mt-1 text-sm text-body">
              Workspace · connected {new Date(details.connectedAt).toLocaleDateString()}
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
          <h2 className="text-[11px] uppercase tracking-widest text-mute">Services · {details.services.length}</h2>
          <button
            onClick={() => void load()}
            className="text-xs inline-flex items-center gap-1 hover:text-ink text-mute"
          >
            <RefreshCw className="h-3 w-3" /> Resync
          </button>
        </div>
        <ul className="divide-y divide-hairline -mx-2">
          {details.services.map((s) => (
            <li key={s.id} className="px-2 py-3 flex items-center gap-3">
              <RenderIcon className="h-4 w-4 text-mute shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{s.name}</div>
                <div className="text-[11px] text-mute flex items-center gap-2">
                  <span>{s.type}</span>
                  <span>·</span>
                  <span>updated {new Date(s.updatedAt).toLocaleDateString()}</span>
                  {s.url && (
                    <>
                      <span>·</span>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-ink"
                      >
                        Visit <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
          {details.services.length === 0 && (
            <li className="px-2 py-6 text-sm text-mute text-center">No services found.</li>
          )}
        </ul>
      </PageCard>
    </div>
  )
}
