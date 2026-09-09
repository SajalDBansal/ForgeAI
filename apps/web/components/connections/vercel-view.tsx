"use client"

import { ExternalLink, RefreshCw } from "lucide-react"

import { PageCard } from "@/components/layout/page-card"
import {
  ConnectLink,
  ConnectionDetailSkeleton,
  NotConnectedCard,
  useConnectionDetails,
  useDisconnect,
} from "@/components/connections/connection-detail"
import { VercelIcon } from "@/components/brand/vercel-icon"

interface VercelProject {
  name: string
  framework: string | null
  updatedAt: string
  url: string | null
}

interface VercelDetails {
  login: string
  teamId: string | null
  connectedAt: string
  projects: VercelProject[]
}

// Connected Vercel account and its projects.
// Supports resync and disconnect.
export function VercelView() {
  const { details, loading, load } =
    useConnectionDetails<VercelDetails>("vercel")
  const disconnect = useDisconnect("vercel", "Vercel")

  if (loading) return <ConnectionDetailSkeleton />

  if (!details) {
    return (
      <NotConnectedCard name="Vercel">
        <ConnectLink slug="vercel" name="Vercel" />
      </NotConnectedCard>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageCard className="p-5">
        <div className="flex items-start gap-4">
          <div className="bg-ink text-on-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-sm">
            <VercelIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-bold">{details.login}</h2>
              <span className="bg-success/15 text-success shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] tracking-widest uppercase">
                Connected
              </span>
            </div>
            <p className="text-body mt-1 text-sm">
              {details.teamId ? `Team · ${details.teamId}` : "Personal account"}{" "}
              · connected {new Date(details.connectedAt).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={disconnect}
            className="border-hairline hover:bg-surface-soft h-9 shrink-0 rounded-sm border px-4 text-sm font-medium"
          >
            Disconnect
          </button>
        </div>
      </PageCard>

      <PageCard className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-mute text-[11px] tracking-widest uppercase">
            Projects · {details.projects.length}
          </h2>
          <button
            onClick={() => void load()}
            className="hover:text-ink text-mute inline-flex items-center gap-1 text-xs"
          >
            <RefreshCw className="h-3 w-3" /> Resync
          </button>
        </div>
        <ul className="divide-hairline -mx-2 divide-y">
          {details.projects.map((p) => (
            <li key={p.name} className="flex items-center gap-3 px-2 py-3">
              <VercelIcon className="text-mute h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="text-mute flex items-center gap-2 text-[11px]">
                  <span>{p.framework ?? "No framework"}</span>
                  <span>·</span>
                  <span>
                    updated {new Date(p.updatedAt).toLocaleDateString()}
                  </span>
                  {p.url && (
                    <>
                      <span>·</span>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-ink inline-flex items-center gap-1"
                      >
                        Visit <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
          {details.projects.length === 0 && (
            <li className="text-mute px-2 py-6 text-center text-sm">
              No projects found.
            </li>
          )}
        </ul>
      </PageCard>
    </div>
  )
}
