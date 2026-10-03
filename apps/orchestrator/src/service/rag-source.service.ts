import type { RagSource } from "@forgeAI/shared"

import { r2 } from "../lib/r2.js"
import { findSnapshot } from "./restore.service.js"
import { snapshotProject } from "./snapshot.service.js"

/** How long the knowledge graph's download link works. One download, straight after signing. */
const DOWNLOAD_URL_TTL_SECONDS = 300

export type RagSourceResult =
  | { ok: true; source: RagSource }
  | {
      ok: false
      reason: "no_pod" | "save_failed" | "no_snapshot"
      detail?: string
    }

// Gives the knowledge graph (rag-service, work plan Q5) a link to the project's current source.
// Saves first, but only if something changed, so an unchanged project keeps its ETag and the
// next index answers "up to date" without downloading anything.
export async function ragSource(projectId: string): Promise<RagSourceResult> {
  let outcome = await snapshotProject(projectId)
  // Another save is running: wait for it and take a fresh one, so the link is current.
  if (!outcome.ok && outcome.reason === "busy")
    outcome = await snapshotProject(projectId, true)
  if (!outcome.ok) {
    return outcome.reason === "no_pod"
      ? { ok: false, reason: "no_pod" }
      : {
          ok: false,
          reason: "save_failed",
          detail: outcome.detail ?? outcome.reason,
        }
  }

  // The held copy (a large deletion awaiting confirmation) comes first: it's what people have now.
  let snapshot = await findSnapshot(projectId)
  if (!snapshot) {
    // Never saved and nothing changed since the sandbox opened (a fresh project): save once now.
    const forced = await snapshotProject(projectId, true)
    if (!forced.ok)
      return {
        ok: false,
        reason: forced.reason === "no_pod" ? "no_pod" : "save_failed",
        detail: forced.detail,
      }
    snapshot = await findSnapshot(projectId)
  }
  if (!snapshot) return { ok: false, reason: "no_snapshot" }

  const head = await r2.headObject(snapshot.key)
  if (!head?.etag) return { ok: false, reason: "no_snapshot" }

  return {
    ok: true,
    source: {
      url: await r2.signDownloadUrl(
        snapshot.key,
        "workspace.tar.gz",
        DOWNLOAD_URL_TTL_SECONDS,
      ),
      etag: head.etag,
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
      held: Boolean(snapshot.held),
    },
  }
}
