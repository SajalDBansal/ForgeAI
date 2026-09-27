import type { PodRecord } from "@forgeAI/shared"

// In-memory pod bookkeeping. There is exactly one orchestrator process, so plain Maps
// are enough; after a restart, running sandboxes are re-adopted from E2B metadata.

const pods = new Map<string, PodRecord>()

// Returns the pod record this process holds for a project.
// The first check every sandbox operation makes.
export function getPod(projectId: string): PodRecord | undefined {
  return pods.get(projectId)
}

// Projects with changes not yet in R2. Kept here (not in snapshot.service) to avoid an import cycle.
const dirty = new Set<string>()

// Flags a project as having unsaved changes.
// Called by file writes, terminal input and document flushes.
export function markProjectDirty(projectId: string): void {
  dirty.add(projectId)
}

// Checks whether a project has changes not yet saved to R2.
// Read by the snapshot loop and the reaper.
export function isProjectDirty(projectId: string): boolean {
  return dirty.has(projectId)
}

// Clears a project's unsaved-changes flag.
// Called after a snapshot is verified in R2.
export function clearProjectDirty(projectId: string): void {
  dirty.delete(projectId)
}

// Returns a copy of every pod this process holds.
// A copy so callers (like the reaper) can delete while iterating.
export function listPods(): [projectId: string, pod: PodRecord][] {
  return [...pods]
}

// Stores the pod record for a project.
// Called once a sandbox is created or reattached.
export function setPod(projectId: string, record: PodRecord): void {
  pods.set(projectId, record)
}

// Forgets a project's pod and all bookkeeping attached to it.
// Called when a sandbox is killed or found dead.
export function deletePod(projectId: string): void {
  pods.delete(projectId)
  owners.delete(projectId)
  extendedAt.delete(projectId)
  templateVersions.delete(projectId)
  startedAt.delete(projectId)
}

/** Each project's workspace owner, whose limit its sandbox counts against (capacity §5). */
const owners = new Map<string, string>()

// Returns the workspace owner a project's sandbox counts against, if known.
export function getPodOwner(projectId: string): string | undefined {
  return owners.get(projectId)
}

// Records the workspace owner for a project's sandbox. Set when it opens or is adopted.
export function setPodOwner(projectId: string, ownerId: string): void {
  owners.set(projectId, ownerId)
}

/**
 * Each project's RUNTIME secrets, decrypted (I1). Memory only: never on disk, in snapshots or
 * in git. Kept across sandbox restarts (they belong to the project); refilled by api-server on
 * every open, so a restarted orchestrator gets them back when a tab reconnects.
 */
const secrets = new Map<string, Record<string, string>>()

// The secrets to give a new terminal or dev server (empty when there are none).
export function getProjectSecrets(projectId: string): Record<string, string> {
  return secrets.get(projectId) ?? {}
}

// Replaces a project's secrets with the current set from api-server.
export function setProjectSecrets(
  projectId: string,
  values: Record<string, string>,
): void {
  if (Object.keys(values).length === 0) secrets.delete(projectId)
  else secrets.set(projectId, values)
}

// Forgets a project's secrets, when its sandbox is shut down for good (archive, delete).
export function forgetProjectSecrets(projectId: string): void {
  secrets.delete(projectId)
}

/** When each sandbox was created at E2B; its total lifetime is capped from here. */
const startedAt = new Map<string, number>()

// Returns when a project's sandbox was created at E2B.
// The reaper uses it to recycle sandboxes before E2B's hard lifetime cap.
export function getPodStartedAt(projectId: string): number | undefined {
  return startedAt.get(projectId)
}

// Records when a project's sandbox was created at E2B.
// Taken from E2B for adopted sandboxes so it survives orchestrator restarts.
export function setPodStartedAt(projectId: string, at: Date | number): void {
  startedAt.set(projectId, typeof at === "number" ? at : at.getTime())
}

/** Template version each pod booted from; recorded on snapshots so restores use a matching image. */
const templateVersions = new Map<string, string>()

// Returns the template version a project's pod booted from.
// Stamped onto snapshots so a restore can use the same image.
export function getPodTemplateVersion(projectId: string): string | undefined {
  return templateVersions.get(projectId)
}

// Records (or clears) the template version a project's pod booted from.
// Set when a pod is created or adopted.
export function setPodTemplateVersion(
  projectId: string,
  version: string | undefined,
): void {
  if (version) templateVersions.set(projectId, version)
  else templateVersions.delete(projectId)
}

// Stamps the pod as just used. Cheap enough for the keystroke path.
// Read by the reaper (idleness) and activity.service (when to extend at E2B).
export function markPodUsed(projectId: string): void {
  const pod = pods.get(projectId)
  if (pod) pod.lastUsedAt = new Date()
}

/** When each sandbox's expiry was last extended at E2B; 0 = never or failed. */
const extendedAt = new Map<string, number>()

// Returns when a pod's E2B expiry was last extended (0 if never).
// Used to throttle keep-alive calls to E2B.
export function getPodExtendedAt(projectId: string): number {
  return extendedAt.get(projectId) ?? 0
}

// Records when a pod's E2B expiry was last extended.
// Called after a successful keep-alive.
export function setPodExtendedAt(projectId: string, at: number): void {
  extendedAt.set(projectId, at)
}

// Pods being opened right now. Collaborators opening together share one promise
// instead of each creating (and leaking) a sandbox.
export interface OpeningPod {
  record: PodRecord
  /** True when E2B had no sandbox for this project and a new one was created. */
  created: boolean
}

const openingPods = new Map<string, Promise<OpeningPod>>()

// Returns the in-flight open for a project, if one is running.
// Lets concurrent ensure requests wait on the same sandbox.
export function getOpeningPod(
  projectId: string,
): Promise<OpeningPod> | undefined {
  return openingPods.get(projectId)
}

// Registers the in-flight open for a project.
// Set by the first caller to ensure a pod.
export function setOpeningPod(
  projectId: string,
  work: Promise<OpeningPod>,
): void {
  openingPods.set(projectId, work)
}

// Lists every project this process holds a sandbox for, or is opening one for.
// What capacity checks count (E6).
export function heldProjects(): string[] {
  return [...new Set([...pods.keys(), ...openingPods.keys()])]
}

// Counts this process's sandboxes: registered ones, and opens still in flight (not yet registered).
// Backs GET /internal/capacity, and the opening check later (E7).
export function countSandboxes(): { running: number; opening: number } {
  let opening = 0
  for (const projectId of openingPods.keys())
    if (!pods.has(projectId)) opening += 1
  return { running: pods.size, opening }
}

// Clears the in-flight open marker once it settles.
// Lets the next ensure start fresh.
export function clearOpeningPod(projectId: string): void {
  openingPods.delete(projectId)
}
