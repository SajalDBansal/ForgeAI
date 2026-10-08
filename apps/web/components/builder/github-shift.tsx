"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, GitMerge, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import {
  resolveShiftRequest,
  restoreShiftFileRequest,
  type ShiftChoice,
  type ShiftDetails,
} from "@/lib/build"
import { formatRelativeTime } from "@/lib/types"
import {
  ModalShell,
  btnGhost,
  btnPrimary,
} from "@/components/modal/modal-shell"
import { useGithubShift, type ShiftResolution } from "@/hooks/use-github-shift"

// Builds the sessionStorage key for "Not now" on one GitHub head in one project.
// Remembered per tab and per commit, so the next move asks again.
const dismissedKey = (projectId: string, head: string) =>
  `forgeai:shift-dismissed:${projectId}:${head}`

// Checks whether the popup was dismissed for this GitHub head in this tab.
// Blocked storage counts as not dismissed.
function wasDismissed(projectId: string, head: string): boolean {
  try {
    return sessionStorage.getItem(dismissedKey(projectId, head)) === "1"
  } catch {
    return false
  }
}

// Remembers "Not now" for this GitHub head in this tab.
// Blocked storage just means the popup returns next time.
function dismiss(projectId: string, head: string): void {
  try {
    sessionStorage.setItem(dismissedKey(projectId, head), "1")
  } catch {
    // Storage blocked: the popup just comes back next time.
  }
}

// Warning banner shown to everyone while GitHub has commits the project hasn't taken in.
// Editors get a "Review" button that opens the resolve dialog.
function ShiftBanner({
  rewritten,
  canWrite,
  onReview,
}: {
  rewritten: boolean
  canWrite: boolean
  onReview: () => void
}) {
  return (
    <div className="bg-warning/10 border-warning/40 text-ink flex shrink-0 items-center gap-3 border-b px-4 py-2 text-sm">
      <AlertTriangle className="text-warning h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {rewritten
          ? "This project's GitHub history was rewritten."
          : "This project changed on GitHub since its last commit."}{" "}
        <span className="text-body">
          Committing is paused
          {canWrite
            ? " until it's sorted out."
            : " — waiting for someone who can edit."}
        </span>
      </span>
      {canWrite && (
        <button
          onClick={onReview}
          className="bg-ink text-on-primary h-7 shrink-0 rounded-sm px-3 text-xs"
        >
          Review
        </button>
      )}
    </div>
  )
}

// Everything about GitHub moving outside ForgeAI: the banner, the resolve popup for editors,
// and afterwards the offer to restore files GitHub's changes replaced.
export function GithubShift({
  projectId,
  podReady,
  canWrite,
  isOwner,
}: {
  projectId: string
  podReady: boolean
  canWrite: boolean
  isOwner: boolean
}) {
  const { status, check, resolution, dismissResolution } = useGithubShift(
    projectId,
    podReady,
  )
  const [open, setOpen] = useState(false)
  const shift = status?.state === "shift" ? status : null

  // Auto-opens for editors, once per GitHub head per tab.
  const head = shift?.githubHead
  useEffect(() => {
    if (head && canWrite && !wasDismissed(projectId, head)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true)
    }
  }, [head, canWrite, projectId])
  if (!shift && open) setOpen(false)

  return (
    <>
      {shift && (
        <ShiftBanner
          rewritten={shift.details?.kind === "rewritten"}
          canWrite={canWrite}
          onReview={() => setOpen(true)}
        />
      )}

      {resolution && canWrite && (
        <RestoreNotice
          projectId={projectId}
          resolution={resolution}
          onDismiss={dismissResolution}
        />
      )}

      {open && shift && (
        <ShiftDialog
          projectId={projectId}
          githubHead={shift.githubHead}
          details={shift.details}
          isOwner={isOwner}
          onClose={() => {
            dismiss(projectId, shift.githubHead)
            setOpen(false)
          }}
          onResolved={() => {
            setOpen(false)
            void check(true)
          }}
          onMoved={() => void check(true)}
        />
      )}
    </>
  )
}

// Builds the dialog subtitle: rewritten history, N new commits, or "still comparing".
// Details are null until the sandbox is up.
function shiftSubtitle(details: ShiftDetails | null): string {
  if (!details)
    return "Comparing with GitHub — this needs the project's sandbox, which is starting…"
  if (details.kind === "rewritten") {
    return "Somebody rewrote the repository's history (a force-push). Commits made in ForgeAI may be gone from GitHub. Committing is paused until this is sorted out."
  }
  const n = details.commits.length
  return `${n} new commit${n === 1 ? "" : "s"} on GitHub since this project's last commit. Committing is paused until this is sorted out.`
}

// Builds the success toast after resolving a shift.
// Mentions how many files were replaced (and can be restored).
function resolvedMessage(choice: ShiftChoice, replacedCount: number): string {
  if (choice === "mine") return "Kept this version — it's on GitHub now"
  if (replacedCount)
    return `Brought in GitHub's changes — ${replacedCount} file(s) replaced, restorable`
  return "Brought in GitHub's changes"
}

// Second step of "keep my edits": choose GitHub's or my version for each true conflict.
// Everything else is merged line by line.
function ConflictPicker({
  conflicts,
  picks,
  onPick,
}: {
  conflicts: string[]
  picks: Record<string, "mine" | "theirs">
  onPick: (path: string, side: "mine" | "theirs") => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-body text-sm">
        These files were changed on the same lines both on GitHub and here.
        Choose which version each keeps — the rest is merged line by line.
      </p>
      <ul className="divide-hairline border-hairline divide-y rounded-sm border">
        {conflicts.map((path) => {
          const keep = picks[path] ?? "theirs"
          return (
            <li
              key={path}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              <span className="flex-1 truncate font-mono text-[12.5px]">
                {path}
              </span>
              {(["theirs", "mine"] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => onPick(path, side)}
                  className={`h-7 rounded-sm border px-2.5 text-[11px] ${
                    keep === side
                      ? "bg-ink text-on-primary border-ink"
                      : "border-hairline text-body hover:bg-surface-soft"
                  }`}
                >
                  {side === "theirs" ? "GitHub's" : "Mine"}
                </button>
              ))}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Summary of what changed on GitHub: recent commits, changed files and overlaps with local edits.
// Explains what each resolve option will do.
function ShiftSummary({
  details,
  isOwner,
}: {
  details: ShiftDetails
  isOwner: boolean
}) {
  const rewritten = details.kind === "rewritten"
  const overlaps = new Map(details.overlaps.map((o) => [o.path, o.conflict]))

  return (
    <div className="space-y-4">
      <section>
        <div className="text-mute mb-1.5 text-[11px] tracking-widest uppercase">
          {rewritten ? "Latest commits on GitHub" : "New on GitHub"}
        </div>
        <ul className="space-y-1 text-sm">
          {details.commits
            .slice(-10)
            .reverse()
            .map((c) => (
              <li key={c.sha} className="flex gap-2">
                <span className="text-mute pt-0.5 font-mono text-[11px]">
                  {c.sha.slice(0, 7)}
                </span>
                <span className="text-ink min-w-0 flex-1 truncate">
                  {c.message}
                </span>
                <span className="text-mute shrink-0 text-[11px]">
                  {c.authorName} · {formatRelativeTime(c.date)}
                </span>
              </li>
            ))}
          {details.commits.length > 10 && (
            <li className="text-mute text-[11px]">
              and {details.commits.length - 10} more
            </li>
          )}
        </ul>
      </section>

      <section>
        <div className="text-mute mb-1.5 flex text-[11px] tracking-widest uppercase">
          <span>Files changed on GitHub ({details.files.length})</span>
          <span className="ml-auto font-mono tracking-normal normal-case">
            <span className="text-success">
              +{details.files.reduce((s, f) => s + f.additions, 0)}
            </span>{" "}
            <span className="text-danger">
              −{details.files.reduce((s, f) => s + f.deletions, 0)}
            </span>
          </span>
        </div>
        <ul className="border-hairline divide-hairline max-h-56 divide-y overflow-y-auto rounded-sm border">
          {details.files.slice(0, 200).map((f) => {
            const overlap = overlaps.get(f.path)
            return (
              <li
                key={f.path}
                className="flex items-center gap-3 px-3 py-1.5 text-[12.5px]"
              >
                <span className="text-ink min-w-0 flex-1 truncate font-mono">
                  {f.path}
                </span>
                {overlap !== undefined && (
                  <span className="text-warning shrink-0 text-[10px]">
                    ⚠{" "}
                    {overlap
                      ? "changed here on the same lines"
                      : "also changed here — merges cleanly"}
                  </span>
                )}
                <span className="text-success shrink-0">+{f.additions}</span>
                <span className="text-danger shrink-0">−{f.deletions}</span>
              </li>
            )
          })}
        </ul>
      </section>

      {details.overlaps.length === 0 ? (
        <p className="text-success text-sm">
          Nothing here conflicts — safe to update.
        </p>
      ) : (
        <p className="text-body text-sm">
          <span className="text-warning">⚠</span> {details.overlaps.length}{" "}
          file(s) have changes here that aren&apos;t committed.{" "}
          <strong>Get GitHub&apos;s changes</strong> replaces them with
          GitHub&apos;s version; everything is backed up first, and you can
          restore any of them afterwards.
        </p>
      )}
      {isOwner && (
        <p className="text-mute text-[11px]">
          <strong>Keep my version</strong> adds one commit on top of
          GitHub&apos;s that puts every file back to how it is here, uncommitted
          work included. GitHub&apos;s commits stay in its history.
        </p>
      )}
    </div>
  )
}

// Dialog to resolve a GitHub shift: take GitHub's changes, merge them with local edits, or keep this version.
// Refreshes the status if GitHub moved again or someone else resolved it first.
function ShiftDialog({
  projectId,
  githubHead,
  details,
  isOwner,
  onClose,
  onResolved,
  onMoved,
}: {
  projectId: string
  githubHead: string
  details: ShiftDetails | null
  isOwner: boolean
  onClose: () => void
  onResolved: () => void
  onMoved: () => void
}) {
  const [busy, setBusy] = useState<ShiftChoice | null>(null)
  // Second step of "keep my edits": who wins each truly conflicting file.
  const [picking, setPicking] = useState(false)
  const [picks, setPicks] = useState<Record<string, "mine" | "theirs">>({})

  const rewritten = details?.kind === "rewritten"
  const conflicts =
    details?.overlaps.filter((o) => o.conflict).map((o) => o.path) ?? []
  const canMerge = !rewritten && (details?.overlaps.length ?? 0) > 0

  // Sends the chosen resolution (with any per-file picks) and reports the outcome.
  const resolve = async (choice: ShiftChoice) => {
    setBusy(choice)
    const result = await resolveShiftRequest(projectId, {
      choice,
      expectHead: githubHead,
      picks: Object.entries(picks).map(([path, keep]) => ({ path, keep })),
    })
    setBusy(null)
    if (!result.ok) {
      toast.error(result.message)
      // GitHub moved again or someone else resolved it: re-check.
      if (result.status === 409) onMoved()
      return
    }
    toast.success(resolvedMessage(choice, result.data.replaced.length))
    onResolved()
  }

  return (
    <ModalShell
      title={
        rewritten
          ? "GitHub's history was rewritten"
          : "This project changed on GitHub"
      }
      subtitle={shiftSubtitle(details)}
      width="max-w-2xl"
      onClose={busy ? undefined : onClose}
      footer={
        picking ? (
          <>
            <button
              onClick={() => setPicking(false)}
              disabled={!!busy}
              className={btnGhost}
            >
              Back
            </button>
            <button
              onClick={() => void resolve("merge")}
              disabled={!!busy}
              className={`${btnPrimary} disabled:opacity-60`}
            >
              <GitMerge className="h-4 w-4" /> {busy ? "Merging…" : "Merge"}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onClose}
              disabled={!!busy}
              className={`${btnGhost} mr-auto`}
            >
              Not now
            </button>
            {isOwner && (
              <button
                onClick={() => void resolve("mine")}
                disabled={!!busy || !details}
                className={`${btnGhost} disabled:opacity-50`}
              >
                {busy === "mine" ? "Keeping…" : "Keep my version"}
              </button>
            )}
            {canMerge && (
              <button
                onClick={() =>
                  conflicts.length ? setPicking(true) : void resolve("merge")
                }
                disabled={!!busy || !details}
                className={`${btnGhost} disabled:opacity-50`}
              >
                {busy === "merge"
                  ? "Merging…"
                  : "Get GitHub's changes, keep my edits"}
              </button>
            )}
            <button
              onClick={() => void resolve("theirs")}
              disabled={!!busy || !details}
              className={`${btnPrimary} disabled:opacity-60`}
            >
              {busy === "theirs" ? "Updating…" : "Get GitHub's changes"}
            </button>
          </>
        )
      }
    >
      {!details ? (
        <p className="text-mute text-sm">
          Nothing is changed until you choose.
        </p>
      ) : picking ? (
        <ConflictPicker
          conflicts={conflicts}
          picks={picks}
          onPick={(path, side) => setPicks((p) => ({ ...p, [path]: side }))}
        />
      ) : (
        <ShiftSummary details={details} isOwner={isOwner} />
      )}
    </ModalShell>
  )
}

// Notice listing files whose uncommitted work GitHub's changes replaced, each restorable.
// Restores come from the backup made before the shift was resolved.
function RestoreNotice({
  projectId,
  resolution,
  onDismiss,
}: {
  projectId: string
  resolution: ShiftResolution
  onDismiss: () => void
}) {
  const [restored, setRestored] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)

  // Restores one file from the backup and marks it done.
  const restore = async (path: string) => {
    setBusy(path)
    const result = await restoreShiftFileRequest(
      projectId,
      resolution.backup,
      path,
    )
    setBusy(null)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    setRestored((s) => new Set(s).add(path))
  }

  return (
    <div className="bg-surface-soft border-hairline shrink-0 border-b px-4 py-2 text-sm">
      <div className="flex items-center gap-3">
        <RotateCcw className="text-mute h-4 w-4 shrink-0" />
        <span className="text-body min-w-0 flex-1">
          {resolution.byName} brought in GitHub&apos;s changes, replacing
          uncommitted work in {resolution.replaced.length} file(s).
        </span>
        <button
          onClick={onDismiss}
          className="text-mute hover:text-ink shrink-0 text-[11px]"
        >
          Dismiss
        </button>
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {resolution.replaced.slice(0, 20).map((path) => (
          <li key={path}>
            <button
              onClick={() => void restore(path)}
              disabled={busy === path || restored.has(path)}
              className="border-hairline hover:bg-canvas h-6 rounded-sm border px-2 font-mono text-[11px] disabled:opacity-60"
              title="Put back the version that was here before, as an uncommitted change"
            >
              {restored.has(path)
                ? `✓ ${path}`
                : busy === path
                  ? `Restoring ${path}…`
                  : `Restore ${path}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
