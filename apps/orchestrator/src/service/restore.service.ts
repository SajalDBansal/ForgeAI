import {
  pendingSnapshotKey,
  PROJECT_ROOT,
  SANDBOX_COMMAND_TIMEOUT_MS,
  SANDBOX_TRANSFER_TIMEOUT_S,
  snapshotKey,
  templateImageBase,
  templateImageName,
  type SnapshotShrink,
} from "@forgeAI/shared"

import { ENV_CONFIG } from "../envConfig.js"
import { r2 } from "../lib/r2.js"
import { provider } from "../lib/provider.js"

const FOLDER = ENV_CONFIG.R2_SNAPSHOT_FOLDER_NAME

/** Downloaded outside the workdir that is about to be emptied. */
const DOWNLOAD_FILE = "/tmp/forgeai/restore.tar.gz"

/** Short-lived: this URL grants read access to a whole project. */
const DOWNLOAD_URL_TTL_SECONDS = 300

export interface StoredSnapshot {
  /** The R2 key: the live copy or a held one. */
  key: string
  /** The image the source was taken from. */
  templateId?: string
  /** The published template version, when recorded. */
  templateVersion?: string
  takenAt?: string
  bytes: number
  /** Set for a copy held back pending a large-deletion confirmation. */
  held?: SnapshotShrink
}

type ObjectHead = { size: number; metadata: Record<string, string> }

// Maps an R2 object's head into the snapshot fields every restore needs.
// Shared by the held and live lookups in findSnapshot.
function toStoredSnapshot(key: string, head: ObjectHead): StoredSnapshot {
  return {
    key,
    templateId: head.metadata.templateid,
    templateVersion: head.metadata.templateversion,
    takenAt: head.metadata.takenat,
    bytes: head.size,
  }
}

// Reads the pending-deletion question stored on a held snapshot's metadata.
// Returns undefined when the counts are missing or malformed.
function heldShrink(head: ObjectHead): SnapshotShrink | undefined {
  const files = Number(head.metadata.files)
  const storedFiles = Number(head.metadata.storedfiles)
  if (!Number.isInteger(files) || !Number.isInteger(storedFiles))
    return undefined
  return {
    files,
    storedFiles,
    at: head.metadata.takenat ?? new Date().toISOString(),
  }
}

// Finds the project's saved source in R2, preferring a held copy over the live one.
// The held copy is newer (what the user actually had), so restoring it avoids losing work.
export async function findSnapshot(
  projectId: string,
): Promise<StoredSnapshot | undefined> {
  const pendingKey = pendingSnapshotKey(FOLDER, projectId)
  const pending = await r2.headObject(pendingKey)
  if (pending && pending.size > 0) {
    const held = heldShrink(pending)
    return { ...toStoredSnapshot(pendingKey, pending), ...(held && { held }) }
  }

  const liveKey = snapshotKey(FOLDER, projectId)
  const head = await r2.headObject(liveKey)
  if (!head || head.size === 0) return undefined

  return toStoredSnapshot(liveKey, head)
}

// Picks the image to restore onto: the snapshot's recorded version, else the requested one.
// Old source on a newer template image may not build, so the recorded version wins.
export function imageForRestore(
  requested: string,
  snapshot: StoredSnapshot | undefined,
): string {
  const version = snapshot?.templateVersion
  if (!version) return requested
  return templateImageName(templateImageBase(requested), version)
}

// Builds the restore script: download first, clear source (keep node_modules), extract.
// Downloading first means a failed transfer leaves the template's files untouched.
function restoreScript(url: string): string {
  return [
    "set -e",
    `mkdir -p "$(dirname ${DOWNLOAD_FILE})" ${PROJECT_ROOT}`,
    `curl --fail -sS --max-time ${SANDBOX_TRANSFER_TIMEOUT_S} '${url}' -o ${DOWNLOAD_FILE}`,
    `tar -tzf ${DOWNLOAD_FILE} >/dev/null`,
    // Remove everything except dependencies so deleted files don't come back from the image.
    `find ${PROJECT_ROOT} -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +`,
    `tar -xzf ${DOWNLOAD_FILE} -C ${PROJECT_ROOT}`,
    `rm -f ${DOWNLOAD_FILE}`,
  ].join("\n")
}

// Puts a project's saved source back into a freshly created sandbox.
// Throws on any failure so the caller kills the pod instead of handing over template code.
export async function restoreSnapshot(
  sandboxId: string,
  snapshot: StoredSnapshot,
): Promise<void> {
  const url = await r2.signDownloadUrl(
    snapshot.key,
    "workspace.tar.gz",
    DOWNLOAD_URL_TTL_SECONDS,
  )

  const result = await provider.runPodCommand(sandboxId, restoreScript(url), {
    timeoutMs: SANDBOX_COMMAND_TIMEOUT_MS.restore,
  })

  if (result.exitCode !== 0) {
    throw new Error(
      `Couldn't restore this project's saved files (exit ${result.exitCode}): ${result.stderr.trim().slice(0, 300)}`,
    )
  }
}
