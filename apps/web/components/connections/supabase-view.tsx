"use client"

import { RefreshCw } from "lucide-react"

import { PageCard } from "@/components/layout/page-card"
import {
  ConnectLink,
  ConnectionDetailSkeleton,
  NotConnectedCard,
  useConnectionDetails,
  useDisconnect,
} from "@/components/connections/connection-detail"
import { SupabaseIcon } from "@/components/brand/supabase-icon"

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

// Connected Supabase organization and its projects.
// Supports resync and disconnect.
export function SupabaseView() {
  const { details, loading, load } =
    useConnectionDetails<SupabaseDetails>("supabase")
  const disconnect = useDisconnect("supabase", "Supabase")

  if (loading) return <ConnectionDetailSkeleton />

  if (!details) {
    return (
      <NotConnectedCard name="Supabase">
        <ConnectLink slug="supabase" name="Supabase" />
      </NotConnectedCard>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageCard className="p-5">
        <div className="flex items-start gap-4">
          <div className="bg-ink flex h-12 w-12 shrink-0 items-center justify-center rounded-sm">
            <SupabaseIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-bold">{details.organizationName}</h2>
              <span className="bg-success/15 text-success shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] tracking-widest uppercase">
                Connected
              </span>
            </div>
            <p className="text-body mt-1 text-sm">
              Organization · connected{" "}
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
            <li key={p.id} className="flex items-center gap-3 px-2 py-3">
              <SupabaseIcon className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="text-mute flex items-center gap-2 text-[11px]">
                  <span>{p.region}</span>
                  <span>·</span>
                  <span
                    className={`rounded-sm px-1.5 py-0.5 text-[10px] tracking-widest uppercase ${
                      p.status === "ACTIVE_HEALTHY"
                        ? "bg-success/15 text-success"
                        : "bg-surface-card text-mute"
                    }`}
                  >
                    {p.status}
                  </span>
                  <span>·</span>
                  <span>
                    created {new Date(p.createdAt).toLocaleDateString()}
                  </span>
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
