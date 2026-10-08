"use client"

import { useState } from "react"
import {
  Copy,
  ExternalLink,
  GitCommit,
  GitCommitVertical,
  RotateCcw,
} from "lucide-react"

import { useWorkspaceRole } from "@/hooks/use-workspace-role"
import { useOpenProject } from "@/lib/project-store"
import {
  githubCommitUrl,
  isGitCommit,
  shortHash,
  type Commit,
} from "@/lib/build"
import { GithubIcon } from "@/components/brand/github-icon"
import { CommitDialog } from "@/components/builder/history/commit-dialog"
import { RollbackDialog } from "@/components/builder/history/rollback-dialog"
import { GithubConnectDialog } from "@/components/github/github-connect-dialog"
import { formatRelativeTime } from "@/lib/types"
import { useProjectStore } from "@/lib/project-store"
import { displayToast } from "@/lib/toast"

// Shows the GitHub login for commits made on GitHub, otherwise the recorded author.
// Used in the commit list and header.
function authorOf(c: Commit) {
  return c.source === "GITHUB" && c.authorLogin ? c.authorLogin : c.author
}

// One commit in the History list: hash, author, age, message and line counts.
// Marks GitHub commits, pre-GitHub versions and the current HEAD.
function CommitListItem({
  commit: c,
  selected,
  onGithub,
  onSelect,
}: {
  commit: Commit
  selected: boolean
  onGithub: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`hover:bg-surface-soft w-full px-4 py-3 text-left ${selected ? "bg-surface-soft" : ""}`}
    >
      <div className="text-mute flex items-center gap-2 font-mono text-[11px]">
        <span>{shortHash(c)}</span>
        <span>·</span>
        <span>{authorOf(c)}</span>
        <span className="ml-auto">{formatRelativeTime(c.createdAt)}</span>
      </div>
      <div className="text-ink mt-1 truncate text-sm">{c.prompt}</div>
      <div className="text-mute mt-1 flex items-center gap-2 text-[11px]">
        <span>{c.filesChanged} files</span>
        <span className="text-success">+{c.additions}</span>
        <span className="text-danger">−{c.deletions}</span>
        {onGithub && isGitCommit(c) && (
          <span
            title={c.source === "GITHUB" ? "Made on GitHub" : "On GitHub"}
            className="inline-flex"
          >
            <GithubIcon className="h-3 w-3" />
          </span>
        )}
        {!isGitCommit(c) && (
          <span className="text-ash text-[10px]">before GitHub</span>
        )}
        {c.isHead && (
          <span className="bg-ink text-on-primary ml-auto rounded-sm px-1.5 py-0.5 text-[10px]">
            HEAD
          </span>
        )}
      </div>
    </button>
  )
}

// The selected commit's prompt and per-file diff summary.
// Shown on the right side of the History tab.
function CommitDetail({ commit: active }: { commit: Commit }) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="border-hairline bg-canvas rounded-sm border p-4">
          <div className="text-mute mb-1 text-[11px]">[ prompt ]</div>
          <p className="text-ink text-sm">{active.prompt}</p>
        </div>

        <div className="border-hairline bg-canvas rounded-sm border">
          <div className="hairline-b text-mute flex items-center px-3 py-2 text-[11px]">
            <span>[ diff summary ]</span>
            <span className="ml-auto font-mono">
              <span className="text-success">+{active.additions}</span>{" "}
              <span className="text-danger">−{active.deletions}</span>
            </span>
          </div>
          <ul className="space-y-1 p-3 font-mono text-[12.5px]">
            <li className="text-mute">{active.filesChanged} files changed</li>
            {active.files?.map((f) => (
              <li key={f.path} className="flex items-center gap-3">
                <span className="text-ink truncate">{f.path}</span>
                <span className="text-success ml-auto shrink-0">
                  +{f.additions}
                </span>
                <span className="text-danger shrink-0">−{f.deletions}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// History tab: the commit list, the selected commit's details, and commit/rollback actions.
// Committing and rolling back are owner-only and paused while GitHub has moved.
export function HistoryTab() {
  const project = useOpenProject()
  // Owner-only actions (the server enforces this too).
  const isOwner = useWorkspaceRole(project.workspaceId) === "OWNER"
  const [committing, setCommitting] = useState(false)
  const [rollingBack, setRollingBack] = useState<Commit | null>(null)
  const [connecting, setConnecting] = useState(false)
  // Only a ForgeAI-managed repo with a first commit can take commits.
  const syncedRepo =
    project.repo?.managed && project.repo.lastKnownSha ? project.repo : null
  // Committing is paused while GitHub has commits not yet brought in.
  const shifted = useProjectStore((s) => s.github?.state === "shift")
  const commits = useProjectStore((s) => s.commits)
  const messages = useProjectStore((s) => s.messages)
  const [selected, setSelected] = useState<string>("")
  const active = commits.find((c) => c.id === selected) ?? commits[0] ?? null

  // Copies a commit hash to the clipboard.
  const copyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash)
      displayToast(`Copied ${hash}`)
    } catch {
      displayToast("Couldn't copy to the clipboard")
    }
  }

  const userPrompts = messages.filter(
    (m) => m.role === "user" && m.kind === "text",
  ).length

  return (
    <div className="bg-canvas flex min-h-0 flex-1">
      {committing && (
        <CommitDialog
          projectId={project.id}
          onClose={() => setCommitting(false)}
        />
      )}
      {rollingBack && (
        <RollbackDialog
          projectId={project.id}
          commit={rollingBack}
          onClose={() => setRollingBack(null)}
        />
      )}
      {connecting && (
        <GithubConnectDialog onClose={() => setConnecting(false)} />
      )}
      <aside className="md:hairline-r flex w-full min-w-0 shrink-0 flex-col md:w-[380px]">
        <div className="hairline-b text-mute flex items-center gap-2 px-4 py-2 text-[11px]">
          <GitCommit className="h-3 w-3" /> [ commits ]
          <span className="ml-auto hidden lg:inline">
            {userPrompts} prompts this session
          </span>
          {/* Without GitHub there are no versions (autosave still keeps the work). */}
          {isOwner && !syncedRepo && (
            <button
              onClick={() => setConnecting(true)}
              className="border-hairline text-ink hover:bg-surface-soft inline-flex h-7 items-center gap-1.5 rounded-sm border px-2.5 font-medium"
            >
              <GithubIcon className="h-3 w-3" /> Put on GitHub
            </button>
          )}
          {!isOwner && !syncedRepo && (
            <span className="text-mute text-[11px]">Not on GitHub yet</span>
          )}
          {isOwner && syncedRepo && (
            <button
              onClick={() => setCommitting(true)}
              disabled={shifted}
              title={
                shifted
                  ? "Paused — this project changed on GitHub. Review it from the banner above."
                  : undefined
              }
              className="border-hairline text-ink hover:bg-surface-soft inline-flex h-7 items-center gap-1.5 rounded-sm border px-2.5 font-medium disabled:pointer-events-none disabled:opacity-50"
            >
              <GitCommitVertical className="h-3 w-3" /> Commit
            </button>
          )}
        </div>
        <ul className="divide-hairline flex-1 divide-y overflow-y-auto">
          {commits.length === 0 && (
            <li className="text-body px-4 py-8 text-center text-sm">
              No commits yet.
            </li>
          )}
          {commits.length > 0 && !syncedRepo && (
            <li className="text-mute bg-surface-soft px-4 py-2.5 text-[11px]">
              {isOwner
                ? "Put this project on GitHub to commit, roll back and keep new versions."
                : "Only the workspace owner can put this project on GitHub."}
            </li>
          )}
          {commits.map((c, i) => (
            <li key={c.id}>
              {/* Heading before the first pre-GitHub (legacy) version. */}
              {c.source === "LEGACY" && commits[i - 1]?.source !== "LEGACY" && (
                <div className="text-mute px-4 pt-3 pb-1 text-[10px] tracking-widest uppercase">
                  Earlier versions (before GitHub)
                </div>
              )}
              <CommitListItem
                commit={c}
                selected={selected === c.id}
                onGithub={!!syncedRepo}
                onSelect={() => setSelected(c.id)}
              />
            </li>
          ))}
        </ul>
      </aside>

      <div className="bg-surface-soft hidden min-w-0 flex-1 flex-col md:flex">
        {!active ? (
          <div className="grid flex-1 place-items-center px-6 text-center">
            <p className="text-body text-sm">
              Select a commit to see what changed.
            </p>
          </div>
        ) : (
          <>
            <div className="hairline-b bg-canvas flex items-center gap-2 px-4 py-2.5">
              <span className="text-mute text-[11px]">[ commit ]</span>
              <span className="font-mono text-sm">{shortHash(active)}</span>
              <span className="text-mute text-[11px]">
                by {authorOf(active)} · {formatRelativeTime(active.createdAt)}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={() => void copyHash(active.hash)}
                  className="text-mute hover:text-ink border-hairline h-7 rounded-sm border px-2 text-[11px]"
                >
                  <Copy className="mr-1 inline h-3 w-3" /> Copy hash
                </button>
                {syncedRepo && isGitCommit(active) && (
                  <a
                    href={githubCommitUrl(syncedRepo, active.hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-mute hover:text-ink border-hairline inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-[11px]"
                  >
                    <GithubIcon className="h-3 w-3" /> View on GitHub{" "}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {/* Restores any version's files as a new commit (owner only, not on HEAD). */}
                {isOwner && syncedRepo && !active.isHead && (
                  <button
                    onClick={() => setRollingBack(active)}
                    disabled={shifted}
                    title={
                      shifted
                        ? "Paused — this project changed on GitHub."
                        : undefined
                    }
                    className="bg-ink text-on-primary hover:bg-ink-deep inline-flex h-7 items-center gap-1 rounded-sm px-2.5 text-[11px] disabled:pointer-events-none disabled:opacity-50"
                  >
                    <RotateCcw className="h-3 w-3" /> Roll back to this
                  </button>
                )}
                {active.isHead && (
                  <span className="bg-surface-card text-ash flex h-7 items-center rounded-sm px-2.5 text-[11px]">
                    Current HEAD
                  </span>
                )}
              </div>
            </div>
            <CommitDetail commit={active} />
          </>
        )}
      </div>
    </div>
  )
}
