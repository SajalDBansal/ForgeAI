"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import type { RepoRef } from "@/lib/types"
import { WordmarkSmall } from "@/components/brand/wordmark"
import { ThemeToggle } from "@/components/brand/theme-toggle"
import { GithubIcon } from "@/components/brand/github-icon"
import { GithubConnectDialog } from "@/components/github/github-connect-dialog"

type OpenDialog = "github" | null

// Project header: breadcrumbs, repo link, status and GitHub connection.
// Shared by the Build and Plan workspaces.
export function WorkspaceHeader({
  projectName,
  workspaceName,
  statusPill,
  primaryAction,
  repo,
}: {
  projectName: string
  workspaceName?: string
  statusPill: ReactNode
  primaryAction?: ReactNode
  repo?: RepoRef | null
}) {
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null)

  return (
    <header className="hairline-b flex h-12 shrink-0 items-center gap-3 px-3 md:px-5">
      <Link
        href="/"
        className="hover:bg-surface-soft grid h-8 w-8 place-items-center rounded-sm"
      >
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
            className="text-mute hover:text-ink hidden max-w-[18ch] truncate text-sm sm:inline"
          >
            {workspaceName}
          </Link>
        </>
      )}
      <span className="text-mute">/</span>
      <div className="max-w-[28ch] truncate text-sm font-medium">
        {projectName}
      </div>
      {repo && (
        <button
          onClick={() => setOpenDialog("github")}
          className="text-mute hover:text-ink hover:bg-surface-soft hidden items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[11px] sm:flex"
          title={`Branch: ${repo.branch}`}
        >
          <GithubIcon className="h-3 w-3" />
          <span className="max-w-[20ch] truncate">
            {repo.owner}/{repo.name}
          </span>
        </button>
      )}
      {statusPill}

      <div className="ml-auto flex items-center gap-1.5">
        <TopAction
          icon={<GithubIcon className="h-3.5 w-3.5" />}
          label="GitHub"
          onClick={() => setOpenDialog("github")}
        />
        <ThemeToggle />
        {primaryAction}
      </div>

      {openDialog === "github" && (
        <GithubConnectDialog
          projectName={projectName}
          onClose={() => setOpenDialog(null)}
        />
      )}
    </header>
  )
}

// Small header button with an icon and label.
// Used for the GitHub connection.
function TopAction({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="text-mute hover:text-ink hover:bg-surface-soft hidden h-8 items-center gap-1.5 rounded-sm px-2.5 text-xs sm:flex"
    >
      {icon} {label}
    </button>
  )
}
