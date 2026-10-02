import {
  pendingSnapshotKey,
  PROJECT_ROOT,
  SANDBOX_COMMAND_TIMEOUT_MS,
  SANDBOX_TRANSFER_TIMEOUT_S,
  snapshotArchiveCommand,
  snapshotFileListCommand,
  snapshotKey,
  stagedSnapshotKey,
  type PodRecord,
  type SnapshotShrink,
  type SnapshotStatus,
  type TerminalCommand,
} from "@forgeAI/shared"

import { ENV_CONFIG } from "../envConfig.js"
import { r2 } from "../lib/r2.js"
import { publishSandboxEvent } from "../lib/redis.js"
import {
  clearProjectDirty,
  getPod,
  getPodTemplateVersion,
  isProjectDirty,
  listPods,
  markProjectDirty,
} from "../state.js"
import { flushProjectDocuments } from "./document.service.js"
import { provider } from "../lib/provider.js"
import {
  isUnsafeSnapshotShrink,
  parseSnapshotFileCount,
} from "./snapshot-policy.js"

const FOLDER = ENV_CONFIG.R2_SNAPSHOT_FOLDER_NAME

/** Dirty projects are swept on a fixed tick, so continuous typing still gets saved. */
const SWEEP_MS = 30_000

/** Most sweep saves running at once; each is a tar and an upload, so a hundred at once is a spike. */
const SWEEP_CONCURRENCY = Math.max(1, ENV_CONFIG.SNAPSHOT_CONCURRENCY)

/** Presigned upload URL lifetime: long enough for a slow upload, short enough to be useless if leaked. */
const UPLOAD_URL_TTL_SECONDS = 600

/** Where the tar is built (outside PROJECT_ROOT so it never archives itself). */
const STAGING_FILE = "/tmp/forgeai/snapshot.tar.gz"
/** NUL-separated list of paths to archive. */
const LIST_FILE = "/tmp/forgeai/snapshot.list"
/** Where the stored copy is downloaded when bringing missing files back. */
const RESTORE_FILE = "/tmp/forgeai/bring-back.tar.gz"
/** One download, straight after signing. */
const DOWNLOAD_URL_TTL_SECONDS = 300

export type SnapshotOutcome =
  /** Verified in R2. `held` = stored in the pending slot awaiting a deletion confirmation (still durable). */
  | { ok: true; bytes: number; held?: true }
  /** Nothing had changed. */
  | { ok: true; skipped: "clean" }
  | {
      ok: false
      /** `busy` is only returned to unforced callers: another snapshot was already running. */
      reason:
        "busy" | "no_pod" | "upload_failed" | "not_uploaded" | "promote_failed"
      detail?: string
    }

type Failure = Extract<SnapshotOutcome, { ok: false }>
type SnapshotKeys = { live: string; staged: string; pending: string }

/** The running snapshot per project; forced callers wait on it, unforced ones step aside. */
const inFlight = new Map<string, Promise<SnapshotOutcome>>()

/** Save status per project, as the status bar and confirmation dialog see it. */
const statuses = new Map<string, SnapshotStatus>()

// Returns the project's current save status (idle when nothing has happened).
// Sent with the ensure response and on every change.
export function getSnapshotStatus(projectId: string): SnapshotStatus {
  return statuses.get(projectId) ?? { state: "idle", shrink: null }
}

// Updates the save status and broadcasts the full status to every tab.
// A failure message is dropped as soon as the state moves on.
function setStatus(projectId: string, patch: Partial<SnapshotStatus>): void {
  const next: SnapshotStatus = { ...getSnapshotStatus(projectId), ...patch }
  if (next.state !== "failed") delete next.message
  statuses.set(projectId, next)
  publishSandboxEvent({ type: "snapshot.status", projectId, ...next })
}

// Formats a command result as "exit N: stderr" for logs and status messages.
// Shared by the upload and bring-back scripts.
function commandDetail(result: { exitCode: number; stderr: string }): string {
  return `exit ${result.exitCode}${result.stderr.trim() ? `: ${result.stderr.trim().slice(0, 300)}` : ""}`
}

// Builds the tar-then-upload script run inside the sandbox.
// Writes a file first (R2 rejects chunked PUTs); `set -e` and `--fail` make failures real failures.
function uploadScript(url: string): string {
  return [
    "set -e",
    `mkdir -p "$(dirname ${STAGING_FILE})"`,
    `rm -f ${STAGING_FILE} ${LIST_FILE}`,
    snapshotFileListCommand(PROJECT_ROOT, LIST_FILE),
    snapshotArchiveCommand(PROJECT_ROOT, LIST_FILE, STAGING_FILE),
    // Counted from the archive, so it's exactly what was stored.
    `echo "FILES=$(tar -tzf ${STAGING_FILE} | wc -l)"`,
    `curl --fail -sS --max-time ${SANDBOX_TRANSFER_TIMEOUT_S} --upload-file ${STAGING_FILE} '${url}'`,
    `rm -f ${STAGING_FILE} ${LIST_FILE}`,
  ].join("\n")
}

// Tars the project source and uploads it straight from the sandbox to R2.
// Returns whether it worked and how many files the archive holds.
async function tarAndUpload(
  sandboxId: string,
  url: string,
): Promise<{ ok: boolean; files: number; detail: string }> {
  const result = await provider.runPodCommand(sandboxId, uploadScript(url), {
    timeoutMs: SANDBOX_COMMAND_TIMEOUT_MS.snapshot,
  })
  const files = parseSnapshotFileCount(result.stdout)

  return {
    ok: result.exitCode === 0 && files !== undefined,
    files: files ?? 0,
    detail:
      result.exitCode === 0 && files === undefined
        ? "snapshot command did not report a valid file count"
        : commandDetail(result),
  }
}

// Saves a project's source to R2 (upload to staging, verify, then promote).
// Forced callers wait for a running snapshot and take their own; unforced ones get `busy`.
export async function snapshotProject(
  projectId: string,
  force = false,
  { allowShrink = false }: { allowShrink?: boolean } = {},
): Promise<SnapshotOutcome> {
  const previous = inFlight.get(projectId)

  if (!force) {
    if (!isProjectDirty(projectId)) return { ok: true, skipped: "clean" }
    if (previous) return { ok: false, reason: "busy" }
  }

  const work = (async () => {
    // takeSnapshot never rejects, so this waits without inheriting the previous outcome.
    if (previous) await previous
    return takeSnapshot(projectId, allowShrink)
  })()

  // Claimed before any await so the next caller queues behind this one.
  inFlight.set(projectId, work)
  try {
    return await work
  } finally {
    if (inFlight.get(projectId) === work) inFlight.delete(projectId)
  }
}

// Builds the R2 metadata recorded on a snapshot.
// Includes the template image and version so a restore can use a matching image.
function snapshotMetadata(
  projectId: string,
  pod: PodRecord,
  takenAt: string,
  files: number,
): Record<string, string> {
  return {
    templateid: pod.templateId,
    takenat: takenAt,
    files: String(files),
    ...(getPodTemplateVersion(projectId) && {
      templateversion: getPodTemplateVersion(projectId)!,
    }),
  }
}

// Moves a shrinking snapshot to the pending slot and asks users to confirm the deletion.
// The stored copy is left alone in case the deletion was a mistake.
async function holdSnapshot(
  projectId: string,
  keys: SnapshotKeys,
  metadata: Record<string, string>,
  shrink: SnapshotShrink,
  bytes: number,
): Promise<SnapshotOutcome> {
  await r2.copyObject(keys.staged, keys.pending, {
    ...metadata,
    storedfiles: String(shrink.storedFiles),
  })
  await r2.deleteObject(keys.staged).catch(() => undefined)

  console.warn(
    `[snapshot] holding ${projectId}'s snapshot for confirmation: ${shrink.files} files vs ${shrink.storedFiles} already stored`,
  )
  setStatus(projectId, { state: "held", shrink })
  return { ok: true, bytes, held: true }
}

// Promotes the staged upload to the live key and drops any superseded held copy.
// The final step of a normal save.
async function promoteSnapshot(
  projectId: string,
  keys: SnapshotKeys,
  metadata: Record<string, string>,
  takenAt: string,
  bytes: number,
  allowShrink: boolean,
): Promise<SnapshotOutcome> {
  await r2.copyObject(keys.staged, keys.live, metadata)
  // A leftover staging object is harmless; the next snapshot overwrites it.
  await r2.deleteObject(keys.staged).catch(() => undefined)

  // A held copy is now superseded; left in place, a restore would prefer it.
  if (getSnapshotStatus(projectId).shrink || allowShrink) {
    await r2.deleteObject(keys.pending).catch(() => undefined)
  }

  setStatus(projectId, { state: "saved", savedAt: takenAt, shrink: null })
  return { ok: true, bytes }
}

// Runs one snapshot from start to finish; only called via snapshotProject.
// Every failure re-marks the project dirty and becomes an outcome, never a throw.
async function takeSnapshot(
  projectId: string,
  allowShrink: boolean,
): Promise<SnapshotOutcome> {
  // Looked up after any wait: the sandbox may have gone meanwhile.
  const pod = getPod(projectId)
  if (!pod) return { ok: false, reason: "no_pod" }

  const keys: SnapshotKeys = {
    live: snapshotKey(FOLDER, projectId),
    staged: stagedSnapshotKey(FOLDER, projectId),
    pending: pendingSnapshotKey(FOLDER, projectId),
  }

  setStatus(projectId, { state: "saving" })

  try {
    // Open documents are ahead of disk; write them out first.
    const flushed = await flushProjectDocuments(projectId)
    if (!flushed.ok) {
      markProjectDirty(projectId)
      return failed(projectId, {
        ok: false,
        reason: "upload_failed",
        detail: `open document flush failed for ${flushed.failed.join(", ")}`,
      })
    }

    // Cleared before the work: changes during the upload belong to the next snapshot.
    clearProjectDirty(projectId)

    const url = await r2.signUploadUrl(keys.staged, UPLOAD_URL_TTL_SECONDS)
    const uploaded = await tarAndUpload(pod.sandboxId, url)
    if (!uploaded.ok) {
      markProjectDirty(projectId)
      return failed(projectId, {
        ok: false,
        reason: "upload_failed",
        detail: uploaded.detail,
      })
    }

    // The sandbox says it worked; make sure R2 agrees.
    const stagedHead = await r2.headObject(keys.staged)
    if (!stagedHead || stagedHead.size === 0) {
      markProjectDirty(projectId)
      return failed(projectId, { ok: false, reason: "not_uploaded" })
    }

    const takenAt = new Date().toISOString()
    const metadata = snapshotMetadata(projectId, pod, takenAt, uploaded.files)

    const liveHead = await r2.headObject(keys.live)
    const storedFiles = Number(liveHead?.metadata.files ?? NaN)

    if (isUnsafeSnapshotShrink(storedFiles, uploaded.files) && !allowShrink) {
      // Not re-marked dirty: the next real change refreshes the held copy.
      const shrink: SnapshotShrink = {
        files: uploaded.files,
        storedFiles,
        at: takenAt,
      }
      return holdSnapshot(projectId, keys, metadata, shrink, stagedHead.size)
    }

    return promoteSnapshot(
      projectId,
      keys,
      metadata,
      takenAt,
      stagedHead.size,
      allowShrink,
    )
  } catch (error) {
    markProjectDirty(projectId)
    return failed(projectId, {
      ok: false,
      reason: "promote_failed",
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}

// Reports a failed save to every tab and returns the outcome.
// Any open deletion question stays open: a failed save answers nothing.
function failed(projectId: string, outcome: Failure): SnapshotOutcome {
  setStatus(projectId, {
    state: "failed",
    message: outcome.detail
      ? `${outcome.reason}: ${outcome.detail}`
      : outcome.reason,
  })
  return outcome
}

// Re-raises the deletion question after a held copy was restored into a sandbox.
// Called by the restore path, the only place this can come from after a restart.
export function noteHeldSnapshot(
  projectId: string,
  shrink: SnapshotShrink,
): void {
  setStatus(projectId, { state: "held", shrink })
}

// Builds the script that extracts only files missing from the project.
// `--skip-old-files` leaves existing files alone, so newer edits aren't undone.
function bringBackScript(url: string): string {
  return [
    "set -e",
    `mkdir -p "$(dirname ${RESTORE_FILE})" ${PROJECT_ROOT}`,
    `curl --fail -sS --max-time ${SANDBOX_TRANSFER_TIMEOUT_S} '${url}' -o ${RESTORE_FILE}`,
    `tar -xzf ${RESTORE_FILE} --skip-old-files -C ${PROJECT_ROOT}`,
    `rm -f ${RESTORE_FILE}`,
  ].join("\n")
}

// Restores the files the project is missing from the stored copy.
// Used when someone answers "that deletion was a mistake".
async function bringMissingFilesBack(
  projectId: string,
  sandboxId: string,
): Promise<{ ok: boolean; detail: string }> {
  const url = await r2.signDownloadUrl(
    snapshotKey(FOLDER, projectId),
    "workspace.tar.gz",
    DOWNLOAD_URL_TTL_SECONDS,
  )
  const result = await provider.runPodCommand(sandboxId, bringBackScript(url), {
    timeoutMs: SANDBOX_COMMAND_TIMEOUT_MS.restore,
  })
  return { ok: result.exitCode === 0, detail: commandDetail(result) }
}

// Handles the deletion-confirmation answer: `new` saves as-is, `old` brings files back first.
// The first answer wins; a late second answer finds nothing to resolve.
export async function handleSnapshotCommand(
  command: Extract<TerminalCommand, { type: "snapshot.resolve" }>,
): Promise<void> {
  const { projectId } = command
  if (!getSnapshotStatus(projectId).shrink) return

  if (command.keep === "new") {
    const outcome = await snapshotProject(projectId, true, {
      allowShrink: true,
    })
    if (!outcome.ok)
      console.error(
        `[snapshot] ${projectId}: confirmed save failed — ${outcome.reason}`,
      )
    return
  }

  const pod = getPod(projectId)
  if (!pod) {
    setStatus(projectId, {
      state: "failed",
      message: "This project has no sandbox running.",
    })
    return
  }

  // Don't extract beside a snapshot that is reading the same tree.
  await inFlight.get(projectId)

  setStatus(projectId, { state: "saving" })
  const restored = await bringMissingFilesBack(projectId, pod.sandboxId)
  if (!restored.ok) {
    setStatus(projectId, {
      state: "failed",
      message: `Couldn't bring the files back: ${restored.detail}`,
    })
    return
  }

  // Forced, so it runs now and queues behind any sweep that started meanwhile.
  const outcome = await snapshotProject(projectId, true)
  if (!outcome.ok) {
    console.error(
      `[snapshot] ${projectId}: save after restoring files failed — ${outcome.reason}`,
    )
  }
}

// Forgets a project's unsaved/in-flight/status state when its pod goes away.
// A held copy survives in R2 and is re-raised by the restore that finds it.
export function forgetProjectSnapshotState(projectId: string): void {
  clearProjectDirty(projectId)
  inFlight.delete(projectId)
  statuses.delete(projectId)
}

/** Dirty projects waiting for a sweep save, oldest first. */
const sweepQueue: string[] = []
/** Projects queued or saving from the sweep; a later sweep doesn't add them twice. */
const sweepQueued = new Set<string>()
let sweepRunning = 0

// Starts queued sweep saves until SWEEP_CONCURRENCY are running; each one that ends starts the next.
// Only the sweep is limited: forced saves (commit, archive, reaper, shutdown) never wait in this queue.
function pumpSweepQueue(): void {
  while (sweepRunning < SWEEP_CONCURRENCY && sweepQueue.length > 0) {
    const projectId = sweepQueue.shift()!
    sweepRunning += 1
    void snapshotProject(projectId)
      .then((outcome) => {
        // busy: a forced save is covering it. no_pod: the sandbox went while it waited.
        if (
          !outcome.ok &&
          outcome.reason !== "busy" &&
          outcome.reason !== "no_pod"
        ) {
          console.error(
            `[snapshot] ${projectId}: ${outcome.reason}${outcome.detail ? ` — ${outcome.detail}` : ""}`,
          )
        }
      })
      .catch((error: unknown) =>
        console.error(`[snapshot] ${projectId}: sweep save threw:`, error),
      )
      .finally(() => {
        sweepRunning -= 1
        sweepQueued.delete(projectId)
        pumpSweepQueue()
      })
  }
}

// Queues an unforced snapshot for every dirty project, at most SWEEP_CONCURRENCY at a time.
// Runs every SWEEP_MS; exported to force a sweep in tests.
export function sweepDirtyProjects(): void {
  for (const projectId of listPods()
    .map(([id]) => id)
    .filter(isProjectDirty)) {
    if (sweepQueued.has(projectId)) continue
    sweepQueued.add(projectId)
    sweepQueue.push(projectId)
  }
  pumpSweepQueue()

  if (sweepQueue.length > 0) {
    console.log(
      `[snapshot] sweep: ${sweepRunning} saving, ${sweepQueue.length} waiting (limit ${SWEEP_CONCURRENCY})`,
    )
  }
}

setInterval(sweepDirtyProjects, SWEEP_MS).unref()
