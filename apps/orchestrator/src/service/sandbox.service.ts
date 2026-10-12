import {
  ProviderCapacityError,
  type PodHandle,
} from "@forgeAI/sandbox-provider"
import type { EnsurePodResponse, PodRecord } from "@forgeAI/shared"
import { publishSandboxEvent } from "../lib/redis.js"
import {
  clearOpeningPod,
  deletePod,
  getOpeningPod,
  getPod,
  getPodOwner,
  forgetProjectSecrets,
  getPodTemplateVersion,
  setOpeningPod,
  setPod,
  setPodOwner,
  setPodExtendedAt,
  setPodStartedAt,
  setPodTemplateVersion,
  type OpeningPod,
} from "../state.js"
import { extendPodNow, SANDBOX_TIMEOUT_MS } from "./activity.service.js"
import {
  checkRoomForNewSandbox,
  SandboxCapacityError,
  waitForCreateTurn,
  type SandboxOwner,
} from "./capacity.service.js"
import { closeProjectDevServer, getDevServerStatus } from "./dev.service.js"
import { closeProjectDocuments } from "./document.service.js"
import { unwatchProject, watchProject } from "./watcher.service.js"
import { forgetReaperState } from "./reaper.service.js"
import { checkGitAvailable, forgetGitState } from "./git.service.js"
import {
  findSnapshot,
  imageForRestore,
  restoreSnapshot,
  type StoredSnapshot,
} from "./restore.service.js"
import {
  forgetProjectSnapshotState,
  getSnapshotStatus,
  noteHeldSnapshot,
  snapshotProject,
} from "./snapshot.service.js"
import { closeProjectTerminal } from "./terminal.service.js"
import { provider } from "../lib/provider.js"

// Turns a provider pod handle into the record we track and send to api-server.
// Every freshly opened pod starts as RUNNING and just used.
function toRecord(pod: PodHandle): PodRecord {
  return {
    sandboxId: pod.sandboxId,
    templateId: pod.templateId,
    status: "RUNNING",
    lastUsedAt: new Date(),
  }
}

// Adds the dev-server and snapshot status to a pod record.
// A tab that just opened missed earlier events, so it needs the current state up front.
function withDevStatus(
  projectId: string,
  record: PodRecord,
  created: boolean,
): EnsurePodResponse {
  return {
    ...record,
    created,
    dev: getDevServerStatus(projectId),
    snapshot: getSnapshotStatus(projectId),
  }
}

// Stores a pod record, its E2B start time, and starts the project's file watcher.
// Shared by every path that ends with a live sandbox for the project.
function registerPod(
  projectId: string,
  record: PodRecord,
  startedAt: Date | number,
): void {
  setPod(projectId, record)
  setPodStartedAt(projectId, startedAt)
  void watchProject(projectId)
}

// Forgets the pod and closes everything this process holds for it.
// Used before replacing, discarding or destroying a project's sandbox.
async function releaseProjectState(projectId: string): Promise<void> {
  const pod = getPod(projectId)
  deletePod(projectId)
  // A replaced or expired sandbox's connection is never used again.
  if (pod) provider.forgetPodConnection(pod.sandboxId)
  await closeProjectTerminal(projectId)
  await closeProjectDevServer(projectId)
  void unwatchProject(projectId)
  closeProjectDocuments(projectId)
  forgetProjectSnapshotState(projectId)
  forgetReaperState(projectId)
  forgetGitState(projectId)
}

// Runs `work` as the project's single in-flight pod opening; concurrent callers join it.
// `work` must already be started, with no await before this call, so the slot is claimed first.
async function openExclusively(
  projectId: string,
  work: Promise<OpeningPod>,
): Promise<OpeningPod> {
  setOpeningPod(projectId, work)
  try {
    return await work
  } finally {
    // Cleared on failure too, so one bad attempt doesn't wedge the project.
    clearOpeningPod(projectId)
  }
}

// Resumes the project's existing E2B sandbox, or creates a new one from its snapshot.
// The slow part of ensurePod; runs once per project at a time.
async function openPod(
  projectId: string,
  templateId: string,
): Promise<OpeningPod> {
  const found = await provider.findPodByProject(projectId)

  if (found) {
    const resumed = await provider.resumePod(found.sandboxId)
    const record = toRecord(resumed)
    // E2B's creation time, not now: the sandbox may be deep into its capped life.
    registerPod(projectId, record, resumed.startedAt)
    void checkGitAvailable(projectId, record.sandboxId, templateId)
    // No restore needed: this sandbox has held the work all along.
    return { record, created: false }
  }

  const record = toRecord(await createFromSnapshot(projectId, templateId))
  registerPod(projectId, record, Date.now())
  void checkGitAvailable(projectId, record.sandboxId, templateId)

  // A new sandbox already has the full window, so skip a redundant extend.
  setPodExtendedAt(projectId, Date.now())

  return { record, created: true }
}

// Creates a sandbox from the snapshot's pinned image, falling back to the current one.
// A pinned version may have been unpublished; opening on the latest beats refusing to open.
// Every new sandbox is created here: open, restore, restart and recycle. Each create first waits
// its turn (E8), so they stay within the plan's creation rate.
async function bootPod(
  projectId: string,
  templateId: string,
  snapshot: StoredSnapshot | undefined,
): Promise<PodHandle> {
  const image = imageForRestore(templateId, snapshot)
  const create = async (
    fromImage: string,
    templateVersion: string | undefined,
  ) => {
    await waitForCreateTurn()
    return provider.createPod(projectId, fromImage, SANDBOX_TIMEOUT_MS, {
      templateVersion,
      ownerId: getPodOwner(projectId),
    })
  }
  try {
    return await create(
      image,
      image === templateId
        ? getPodTemplateVersion(projectId)
        : snapshot?.templateVersion,
    )
  } catch (error) {
    // A full account (or a full queue) would refuse the fallback image too; only a missing image falls back.
    if (
      image === templateId ||
      error instanceof ProviderCapacityError ||
      error instanceof SandboxCapacityError
    )
      throw error
    console.warn(
      `[restore] ${projectId}: image ${image} unavailable, falling back to ${templateId}:`,
      error,
    )
    return create(templateId, getPodTemplateVersion(projectId))
  }
}

// Builds a new sandbox and restores the project's saved work before returning it.
// A failed restore kills the pod: template code shown as someone's project looks like data loss.
async function createFromSnapshot(
  projectId: string,
  templateId: string,
): Promise<PodHandle> {
  const snapshot = await findSnapshot(projectId).catch(() => undefined)
  const pod = await bootPod(projectId, templateId, snapshot)

  if (!snapshot) return pod

  try {
    await restoreSnapshot(pod.sandboxId, snapshot)
    // A held snapshot re-raises its "large deletion" question.
    if (snapshot.held) noteHeldSnapshot(projectId, snapshot.held)
    console.log(
      `[restore] ${projectId}: put back ${snapshot.bytes} bytes saved at ${snapshot.takenAt ?? "an unknown time"}`,
    )
    return pod
  } catch (error) {
    await provider.killPod(pod.sandboxId).catch(() => undefined)
    throw error
  }
}

// Saves the project, kills its sandbox and builds a fresh one with the saved work restored.
// A failed save aborts the restart so nothing is lost.
async function recreatePod(
  projectId: string,
  templateId: string,
): Promise<OpeningPod> {
  const doomed = getPod(projectId)

  if (doomed) {
    const saved = await snapshotProject(projectId, true)
    if (!saved.ok) {
      throw new Error(
        `Couldn't save this project before restarting it (${saved.reason}${saved.detail ? `: ${saved.detail}` : ""}). Nothing has been changed.`,
      )
    }
  }

  // releaseProjectState forgets the owner; the replacement still counts against them.
  const owner = getPodOwner(projectId)
  await releaseProjectState(projectId)
  if (owner) setPodOwner(projectId, owner)
  if (doomed) await provider.killPod(doomed.sandboxId)

  const record = toRecord(await createFromSnapshot(projectId, templateId))
  registerPod(projectId, record, Date.now())
  setPodExtendedAt(projectId, Date.now())
  return { record, created: true }
}

// Refuses a new sandbox the limits have no room for, unless E2B already runs one for the project
// (one this process doesn't hold yet): reattaching to it costs nothing extra, so it's allowed.
async function refuseUnlessRunningAtE2B(
  projectId: string,
  refusal: SandboxCapacityError,
): Promise<void> {
  if (!(await provider.findPodByProject(projectId))) throw refusal
}

// Makes sure the project has a working sandbox: reuse, join an in-flight open, resume or create.
// `created` is true for at most one caller: the one whose request brought the pod into existence.
// Only a sandbox that may be new is checked against the limits (E6); reuse and joining never are.
export async function ensurePod(
  projectId: string,
  templateId: string,
  templateVersion?: string,
  owner?: SandboxOwner,
): Promise<EnsurePodResponse> {
  setPodTemplateVersion(projectId, templateVersion)

  const existing = getPod(projectId)
  if (existing) {
    // A remembered pod may have expired silently, so check before handing it back.
    if (await provider.isPodAlive(existing.sandboxId)) {
      await extendPodNow(projectId, existing.sandboxId)
      return withDevStatus(projectId, existing, false)
    }

    await releaseProjectState(projectId)
    // releaseProjectState cleared the version; the replacement pod still needs it.
    setPodTemplateVersion(projectId, templateVersion)
  }

  const opening = getOpeningPod(projectId)
  if (opening) return withDevStatus(projectId, (await opening).record, false)

  // No await between this check and openExclusively below when there's room, so the slot is
  // claimed before any other open can look.
  const refusal = checkRoomForNewSandbox(projectId, owner)
  if (refusal) {
    await refuseUnlessRunningAtE2B(projectId, new SandboxCapacityError(refusal))
    // That took a moment; another request may have started this project's open meanwhile.
    const joined = getOpeningPod(projectId)
    if (joined) return withDevStatus(projectId, (await joined).record, false)
  }
  if (owner) setPodOwner(projectId, owner.id)

  const { record, created } = await openExclusively(
    projectId,
    openPod(projectId, templateId),
  )
  return withDevStatus(projectId, record, created)
}

// Replaces a sandbox nearing E2B's lifetime cap, then tells every tab to reconnect.
// Called by the reaper; it's a normal restart, so it never proceeds without a verified save.
export async function recyclePod(projectId: string): Promise<void> {
  const pod = getPod(projectId)
  if (!pod) return
  await restartPod(projectId, pod.templateId, getPodTemplateVersion(projectId))
  publishSandboxEvent({ type: "sandbox.reset", projectId })
}

// Returns the in-memory pod record for a project.
// Backs the GET pod status route.
export function getPodStatus(projectId: string): PodRecord | undefined {
  return getPod(projectId)
}

// Restarts the project's sandbox: save, kill, create, restore.
// Waits for any in-flight open first so there is a real sandbox to replace.
export async function restartPod(
  projectId: string,
  templateId: string,
  templateVersion?: string,
  owner?: SandboxOwner,
): Promise<EnsurePodResponse> {
  setPodTemplateVersion(projectId, templateVersion)

  const opening = getOpeningPod(projectId)
  if (opening) await opening.catch(() => undefined)

  // Replacing a running sandbox needs no room; with none running, this creates a new one.
  if (!getPod(projectId)) {
    const refusal = checkRoomForNewSandbox(projectId, owner)
    if (refusal) throw new SandboxCapacityError(refusal)
  }
  if (owner) setPodOwner(projectId, owner.id)

  // Uses the same slot so an ensure arriving mid-restart joins this pod.
  const { record } = await openExclusively(
    projectId,
    recreatePod(projectId, templateId),
  )
  return withDevStatus(projectId, record, true)
}

/** What happened to a sandbox asked to shut down. */
export type DestroyPodOutcome =
  | "destroyed"
  /** There was nothing to shut down. */
  | "no_pod"
  /** Asked to save first and the save failed, so the sandbox was kept; the reaper retries. */
  | "kept_unsaved"

// Shuts a project's sandbox down for good; with `save`, only after a verified snapshot.
// Archive saves first (it can be restored); delete doesn't.
export async function destroyPod(
  projectId: string,
  { save = false }: { save?: boolean } = {},
): Promise<DestroyPodOutcome> {
  const opening = getOpeningPod(projectId)
  if (opening) await opening.catch(() => undefined)

  if (save && getPod(projectId)) {
    // Forced: the dirty flag can't vouch for a sandbox re-adopted after a restart.
    const saved = await snapshotProject(projectId, true)
    if (!saved.ok) {
      console.error(
        `[destroy] keeping ${projectId}'s sandbox: it was asked to save first and the snapshot did not complete (${saved.reason}${saved.detail ? ` — ${saved.detail}` : ""}). The reaper will save and shut it down.`,
      )
      return "kept_unsaved"
    }
  }

  const existing = getPod(projectId)
  await releaseProjectState(projectId)
  // Shut down for good (archive or delete): its secrets aren't needed any more (I1).
  forgetProjectSecrets(projectId)
  if (!existing) return "no_pod"

  await provider.killPod(existing.sandboxId)
  return "destroyed"
}
