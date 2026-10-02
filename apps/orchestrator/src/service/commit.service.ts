import {
  clearProjectSourceCommand,
  createSerialQueue,
  commitKey,
  PROJECT_ROOT,
  pruneEmptyDirsCommand,
  SANDBOX_COMMAND_TIMEOUT_MS,
  SANDBOX_TRANSFER_TIMEOUT_S,
} from "@forgeAI/shared"

import { ENV_CONFIG } from "../envConfig.js"
import { r2 } from "../lib/r2.js"
import { getPod, markProjectDirty } from "../state.js"
import { requireProjectDocumentsFlushed } from "./document.service.js"
import {
  projectRetiringMessage,
  withActiveProjectWork,
} from "./active-work.service.js"
import { provider } from "../lib/provider.js"

const FOLDER = ENV_CONFIG.R2_SNAPSHOT_FOLDER_NAME

const WORK_DIR_TMP = "/tmp/forgeai/commit"
const DOWNLOAD_URL_TTL_SECONDS = 300

/** The commit-queue job running for each project; the next one waits for it. */
const commitQueue = createSerialQueue()

// Runs `run` after any earlier job for the same project, even if that one failed.
// Serializes everything that rewrites a project's files or git (commits, rollbacks, shifts).
export function inCommitQueue<T>(
  projectId: string,
  run: () => Promise<T>,
): Promise<T> {
  return commitQueue.run(projectId, run)
}

export type RestoreOutcome =
  | { ok: true }
  | { ok: false; reason: "no_pod" | "restore_failed"; detail?: string }

// Builds the script that swaps the project's source for a legacy commit archive.
// Downloads first so a failed transfer changes nothing; dependencies and caches are kept.
function rollbackScript(url: string, archive: string): string {
  return [
    "set -e",
    `mkdir -p ${WORK_DIR_TMP}`,
    `curl --fail -sS --max-time ${SANDBOX_TRANSFER_TIMEOUT_S} '${url}' -o ${archive}`,
    clearProjectSourceCommand(PROJECT_ROOT),
    `tar -xzf ${archive} -C ${PROJECT_ROOT}`,
    pruneEmptyDirsCommand(PROJECT_ROOT),
    `rm -f ${archive}`,
  ].join("\n")
}

// Puts a pre-GitHub (tar archive) version back into the sandbox; api-server then commits it.
// Flushes open documents first so they simply reload the new files afterwards.
export function restoreCommit(
  projectId: string,
  commitId: string,
): Promise<RestoreOutcome> {
  return withActiveProjectWork(projectId, "restore", "restore commit", () =>
    inCommitQueue(projectId, async (): Promise<RestoreOutcome> => {
      const pod = getPod(projectId)
      if (!pod) return { ok: false, reason: "no_pod" }

      await requireProjectDocumentsFlushed(projectId)

      const url = await r2.signDownloadUrl(
        commitKey(FOLDER, projectId, commitId),
        "commit.tar.gz",
        DOWNLOAD_URL_TTL_SECONDS,
      )
      const archive = `${WORK_DIR_TMP}/rollback.tar.gz`

      const result = await provider.runPodCommand(
        pod.sandboxId,
        rollbackScript(url, archive),
        {
          timeoutMs: SANDBOX_COMMAND_TIMEOUT_MS.restore,
        },
      )
      if (result.exitCode !== 0) {
        return {
          ok: false,
          reason: "restore_failed",
          detail: `exit ${result.exitCode}: ${result.stderr.trim().slice(0, 300)}`,
        }
      }

      // Files changed behind the editor's back, so the next snapshot must run.
      markProjectDirty(projectId)
      return { ok: true }
    }),
  ).catch((error: unknown) => ({
    ok: false,
    reason: "restore_failed",
    detail:
      projectRetiringMessage(error) ??
      (error instanceof Error ? error.message : String(error)),
  }))
}
