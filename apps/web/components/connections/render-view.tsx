"use client"

import { useState } from "react"
import { ExternalLink, RefreshCw } from "lucide-react"

import { PageCard } from "@/components/layout/page-card"
import {
  ConnectionDetailSkeleton,
  NotConnectedCard,
  connectActionClass,
  useConnectionDetails,
  useDisconnect,
} from "@/components/connections/connection-detail"
import { RenderIcon } from "@/components/brand/render-icon"
import { RenderConnectDialog } from "@/components/connections/render-connect-dialog"

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

// Connected Render workspace and its services.
// Connecting uses a pasted API key instead of OAuth.
export function RenderView() {
  const { details, loading, load } =
    useConnectionDetails<RenderDetails>("render")
  const disconnect = useDisconnect("render", "Render")
  const [connectOpen, setConnectOpen] = useState(false)

  if (loading) return <ConnectionDetailSkeleton />

  if (!details) {
    return (
      <NotConnectedCard
        name="Render"
        extra={
          connectOpen && (
            <RenderConnectDialog
              onClose={() => setConnectOpen(false)}
              onConnected={() => void load()}
            />
          )
        }
      >
        <button
          onClick={() => setConnectOpen(true)}
          className={connectActionClass}
        >
          Connect Render
        </button>
      </NotConnectedCard>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageCard className="p-5">
        <div className="flex items-start gap-4">
          <div className="bg-ink text-on-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-sm">
            <RenderIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-bold">{details.ownerName}</h2>
              <span className="bg-success/15 text-success shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] tracking-widest uppercase">
                Connected
              </span>
            </div>
            <p className="text-body mt-1 text-sm">
              Workspace · connected{" "}
              {new Date(details.connectedAt).toLocaleDateString()}
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
            Services · {details.services.length}
          </h2>
          <button
            onClick={() => void load()}
            className="hover:text-ink text-mute inline-flex items-center gap-1 text-xs"
          >
            <RefreshCw className="h-3 w-3" /> Resync
          </button>
        </div>
        <ul className="divide-hairline -mx-2 divide-y">
          {details.services.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-2 py-3">
              <RenderIcon className="text-mute h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{s.name}</div>
                <div className="text-mute flex items-center gap-2 text-[11px]">
                  <span>{s.type}</span>
                  <span>·</span>
                  <span>
                    updated {new Date(s.updatedAt).toLocaleDateString()}
                  </span>
                  {s.url && (
                    <>
                      <span>·</span>
                      <a
                        href={s.url}
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
          {details.services.length === 0 && (
            <li className="text-mute px-2 py-6 text-center text-sm">
              No services found.
            </li>
          )}
        </ul>
      </PageCard>
    </div>
  )
}
