"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import {
  ModalShell,
  btnGhost,
  btnPrimary,
} from "@/components/modal/modal-shell"
import { GithubIcon } from "@/components/brand/github-icon"
import { useIdempotencyKey } from "@/hooks/use-idempotency-key"
import { isInProgress } from "@/lib/api-client"
import { useWorkspaceRole } from "@/hooks/use-workspace-role"
import {
  connectGithubRequest,
  githubCommitUrl,
  githubRepoUrl,
  githubStatusRequest,
  isGitCommit,
} from "@/lib/build"
import { useOpenProject, useProjectStore } from "@/lib/project-store"
import { PUBLIC_ENV } from "@/lib/env"

const AUTH_URL = PUBLIC_ENV.AUTH_URL

/** The owner's own GitHub connection, as far as this dialog needs it. */
type OwnerConnection =
  | { status: "loading" }
  | { status: "none" }
  | { status: "connected"; login: string; canCreateRepos: boolean }

// Fetches the signed-in owner's GitHub connection, or "none" if it's missing or fails.
// Tells the dialog whether it can create repos in their account.
async function loadOwnerConnection(): Promise<OwnerConnection> {
  try {
    const res = await fetch(`${AUTH_URL}/api/v1/connections/github`, {
      credentials: "include",
    })
    if (!res.ok) return { status: "none" }
    const data = (await res.json()) as {
      login: string
      canCreateRepos?: boolean
    }
    return {
      status: "connected",
      login: data.login,
      canCreateRepos: Boolean(data.canCreateRepos),
    }
  } catch {
    return { status: "none" }
  }
}

// Describes the project's GitHub state under the repo name.
// Varies for managed repos, imported repos, and projects not on GitHub yet.
function repoSummary(
  managedBranch: string | null,
  imported: boolean,
  isOwner: boolean,
): string {
  if (managedBranch)
    return `Branch ${managedBranch} · every commit is pushed here`
  if (imported)
    return "This project was imported from this repository. ForgeAI doesn't push to it."
  return isOwner
    ? "Put it on GitHub to commit, see history and roll back."
    : "Only the workspace owner can put this project on GitHub."
}

// Shows the project's GitHub repository and, for the owner, how to put it on GitHub.
// Opening it re-checks GitHub so any outside pushes are noticed immediately.
export function GithubConnectDialog({
  onClose,
}: {
  projectName?: string
  onClose?: () => void
}) {
  const project = useOpenProject()
  const head = useProjectStore((s) => s.commits.find((c) => c.isHead) ?? null)
  const isOwner = useWorkspaceRole(project.workspaceId) === "OWNER"
  const repo = project.repo ?? null
  const [connection, setConnection] = useState<OwnerConnection>({
    status: "loading",
  })
  const [syncing, setSyncing] = useState(false)
  const idempotency = useIdempotencyKey()

  // Always re-check GitHub when the dialog opens.
  const setGithub = useProjectStore((s) => s.setGithub)
  const shifted = useProjectStore((s) => s.github?.state === "shift")
  useEffect(() => {
    void githubStatusRequest(project.id, true).then((result) => {
      if (result.ok) setGithub(result.data)
    })
  }, [project.id, setGithub])

  // Only the owner's connection matters, and only the owner can read it.
  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    void loadOwnerConnection().then((next) => {
      if (!cancelled) setConnection(next)
    })
    return () => {
      cancelled = true
    }
  }, [isOwner])

  // Creates the repo (if needed) and makes the first commit from the sandbox.
  const sync = async () => {
    setSyncing(true)
    const result = await connectGithubRequest(
      project.id,
      idempotency.key(project.id),
    )
    setSyncing(false)
    if (!result.ok) {
      if (!isInProgress(result)) toast.error(result.message)
      return
    }
    idempotency.renew()
    toast.success(
      "This project is on GitHub now — its files are the first commit",
    )
  }

  const managed = repo?.managed ? repo : null
  // Has a first commit, so every future commit is pushed automatically.
  const onGithub = Boolean(managed?.lastKnownSha)

  return (
    <ModalShell
      title="GitHub"
      subtitle="Versions of this project live on GitHub: every commit is pushed to a private repository in the workspace owner's account."
      width="max-w-lg"
      onClose={onClose}
      footer={
        <button onClick={onClose} className={btnGhost}>
          Done
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="bg-ink text-on-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-sm">
            <GithubIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">
                {repo ? `${repo.owner}/${repo.name}` : "No repository yet"}
              </span>
              <span
                className={`rounded-sm px-1.5 py-0.5 text-[10px] tracking-widest uppercase ${
                  managed
                    ? "bg-success/15 text-success"
                    : "bg-surface-card text-mute"
                }`}
              >
                {managed ? "Synced" : repo ? "Imported" : "Not on GitHub"}
              </span>
            </div>
            <p className="text-body mt-0.5 text-xs">
              {repoSummary(managed?.branch ?? null, Boolean(repo), isOwner)}
            </p>
          </div>
        </div>

        {repo && (
          <div className="flex flex-wrap gap-2">
            <a
              href={githubRepoUrl(repo)}
              target="_blank"
              rel="noreferrer"
              className={btnGhost}
            >
              Open repository <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {managed && head && isGitCommit(head) && (
              <a
                href={githubCommitUrl(managed, head.hash)}
                target="_blank"
                rel="noreferrer"
                className={btnGhost}
              >
                Latest commit <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}

        {/* What the owner can do next, depending on their connection. */}
        {isOwner && (!repo || managed) && (
          <div className="border-hairline rounded-sm border p-3 text-sm">
            {connection.status === "loading" && (
              <p className="text-mute">Checking your GitHub connection…</p>
            )}

            {connection.status === "none" && (
              <div className="flex items-center gap-3">
                <p className="text-body flex-1">
                  Connect your GitHub account to push this project there.
                </p>
                <Link href="/connections" className={btnPrimary}>
                  <GithubIcon className="h-4 w-4" /> Connect GitHub
                </Link>
              </div>
            )}

            {connection.status === "connected" &&
              !connection.canCreateRepos &&
              !managed && (
                <div className="flex items-center gap-3">
                  <p className="text-body flex-1">
                    Connected as{" "}
                    <span className="font-medium">{connection.login}</span>.
                    Allow ForgeAI to create repositories in your account.
                  </p>
                  <a
                    href={`${AUTH_URL}/api/v1/connections/github/authorize`}
                    className={btnPrimary}
                  >
                    Allow
                  </a>
                </div>
              )}

            {connection.status === "connected" && onGithub && (
              <p className="text-body">
                {shifted
                  ? "This repository has commits the project hasn't taken in — review them from the banner on the page."
                  : "Every commit you make is pushed here as it happens — there is nothing to sync by hand."}
              </p>
            )}

            {connection.status === "connected" &&
              !onGithub &&
              (connection.canCreateRepos || managed) && (
                <div className="flex items-center gap-3">
                  <p className="text-body flex-1">
                    {managed
                      ? "The repository is ready. Its first commit is made from the project's files once its sandbox is up — or now."
                      : "Creates a private repository and commits the project's files as they are now — uncommitted work included."}
                  </p>
                  <button
                    onClick={() => void sync()}
                    disabled={syncing}
                    className={`${btnPrimary} disabled:opacity-60`}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
                    />
                    {syncing
                      ? "Pushing…"
                      : managed
                        ? "Commit now"
                        : "Put on GitHub"}
                  </button>
                </div>
              )}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
