"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, Download, Share2 } from "lucide-react"

import type { RepoRef } from "@/lib/types"
import { WordmarkSmall } from "@/components/brand/wordmark"
import { ThemeToggle } from "@/components/brand/theme-toggle"
import { GithubIcon } from "@/components/brand/github-icon"
import { ShareDialog } from "@/components/share/share-dialog"
import { ExportDialog } from "@/components/export/export-dialog"
import { GithubConnectDialog } from "@/components/github/github-connect-dialog"

type OpenDialog = "share" | "export" | "github" | null

export function WorkspaceHeader({
  projectName,
  workspaceName,
  statusPill,
  showContext = false,
  primaryAction,
  repo,
}: {
  projectName: string
  workspaceName?: string
  statusPill: ReactNode
  showContext?: boolean
  primaryAction: ReactNode
  repo?: RepoRef | null
}) {
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null)

  return (
    <header className="hairline-b px-3 md:px-5 h-12 flex items-center gap-3 shrink-0">
      <Link href="/" className="h-8 w-8 grid place-items-center hover:bg-surface-soft rounded-sm">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <div className="hidden sm:block">
        <WordmarkSmall />
      </div>
      {workspaceName && (
        <>
          <span className="text-mute">/</span>
          <Link
            href="/workspaces"
            className="hidden sm:inline text-sm text-mute hover:text-ink truncate max-w-[18ch]"
          >
            {workspaceName}
          </Link>
        </>
      )}
      <span className="text-mute">/</span>
      <div className="text-sm font-medium truncate max-w-[28ch]">{projectName}</div>
      {repo && (
        <button
          onClick={() => setOpenDialog("github")}
          className="hidden sm:flex items-center gap-1.5 text-[11px] text-mute hover:text-ink px-1.5 py-0.5 rounded-sm hover:bg-surface-soft"
          title={`Branch: ${repo.branch}`}
        >
          <GithubIcon className="h-3 w-3" />
          <span className="truncate max-w-[20ch]">
            {repo.owner}/{repo.name}
          </span>
        </button>
      )}
      {statusPill}

      <div className="ml-auto flex items-center gap-1.5">
        {showContext && (
          <div className="hidden lg:flex items-center gap-2 text-[11px] text-mute mr-2">
            <span>ctx</span>
            <div className="w-24 h-1 bg-surface-card rounded-sm overflow-hidden">
              <div className="h-full bg-ink" style={{ width: "32%" }} />
            </div>
            <span className="tabular-nums">32% · 1,240 tok</span>
          </div>
        )}
        <TopAction icon={<Share2 className="h-3.5 w-3.5" />} label="Share" onClick={() => setOpenDialog("share")} />
        <TopAction icon={<Download className="h-3.5 w-3.5" />} label="Export" onClick={() => setOpenDialog("export")} />
        <TopAction icon={<GithubIcon className="h-3.5 w-3.5" />} label="GitHub" onClick={() => setOpenDialog("github")} />
        <ThemeToggle />
        {primaryAction}
      </div>

      {openDialog === "share" && (
        <ShareDialog projectName={projectName} onClose={() => setOpenDialog(null)} />
      )}
      {openDialog === "export" && <ExportDialog onClose={() => setOpenDialog(null)} />}
      {openDialog === "github" && (
        <GithubConnectDialog projectName={projectName} onClose={() => setOpenDialog(null)} />
      )}
    </header>
  )
}

function TopAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="hidden sm:flex h-8 px-2.5 text-xs text-mute hover:text-ink hover:bg-surface-soft rounded-sm items-center gap-1.5"
    >
      {icon} {label}
    </button>
  )
}
