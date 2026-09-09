"use client"

import { GitBranch, Lock, RefreshCw } from "lucide-react"

import { PageCard } from "@/components/layout/page-card"
import {
  ConnectLink,
  ConnectionDetailSkeleton,
  NotConnectedCard,
  useConnectionDetails,
  useDisconnect,
} from "@/components/connections/connection-detail"
import { GithubIcon } from "@/components/brand/github-icon"

interface GithubRepo {
  name: string
  fullName: string
  private: boolean
  defaultBranch: string
  htmlUrl: string
  updatedAt: string
}

interface GithubDetails {
  login: string
  avatarUrl: string
  accountType: string
  connectedAt: string
  repos: GithubRepo[]
}

// Connected GitHub account and the repositories the ForgeAI App can access.
// Supports resync and disconnect.
export function GithubView() {
  const { details, loading, load } =
    useConnectionDetails<GithubDetails>("github")
  const disconnect = useDisconnect("github", "GitHub")

  if (loading) return <ConnectionDetailSkeleton />

  if (!details) {
    return (
      <NotConnectedCard name="GitHub">
        <ConnectLink slug="github" name="GitHub" />
      </NotConnectedCard>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageCard className="p-5">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- external, per-account GitHub avatar; not worth a remotePatterns config for one avatar */}
          <img
            src={details.avatarUrl}
            alt={details.login}
            className="h-12 w-12 shrink-0 rounded-sm"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-bold">{details.login}</h2>
              <span className="bg-success/15 text-success shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] tracking-widest uppercase">
                Connected
              </span>
            </div>
            <p className="text-body mt-1 text-sm">
              {details.accountType} · connected{" "}
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
            Repositories · {details.repos.length}
          </h2>
          <button
            onClick={() => void load()}
            className="hover:text-ink text-mute inline-flex items-center gap-1 text-xs"
          >
            <RefreshCw className="h-3 w-3" /> Resync
          </button>
        </div>
        <ul className="divide-hairline -mx-2 divide-y">
          {details.repos.map((r) => (
            <li key={r.fullName} className="flex items-center gap-3 px-2 py-3">
              <GithubIcon className="text-mute h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <a
                  href={r.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {r.fullName}
                </a>
                <div className="text-mute flex items-center gap-2 text-[11px]">
                  <GitBranch className="h-3 w-3" /> {r.defaultBranch}
                  <span>·</span>
                  {r.private && <Lock className="h-3 w-3" />}
                  <span>{r.private ? "private" : "public"}</span>
                  <span>·</span>
                  <span>
                    updated {new Date(r.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </li>
          ))}
          {details.repos.length === 0 && (
            <li className="text-mute px-2 py-6 text-center text-sm">
              No repositories granted yet.
            </li>
          )}
        </ul>
      </PageCard>
    </div>
  )
}
