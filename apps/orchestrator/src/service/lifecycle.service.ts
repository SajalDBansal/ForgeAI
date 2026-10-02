import type { ProjectPod } from "@forgeAI/sandbox-provider"

import { ENV_CONFIG } from "../envConfig.js"
import { provider } from "../lib/provider.js"
import { publishSandboxEvent } from "../lib/redis.js"
import {
  getPod,
  isProjectDirty,
  listPods,
  markProjectDirty,
  setPod,
  setPodOwner,
  setPodStartedAt,
  setPodTemplateVersion,
} from "../state.js"
import { flushProjectDocuments } from "./document.service.js"
import { waitForActiveProjectWork } from "./active-work.service.js"
import { snapshotProject } from "./snapshot.service.js"
import { watchProject } from "./watcher.service.js"

// Startup and shutdown handling. All pod state is in memory, so on start we re-adopt every
// running sandbox (marked dirty so it gets saved), and on stop we save what we can in time.

// Puts one running sandbox back under this process's care and tells its tabs to reconnect.
// Marked dirty because we can't know what changed while nothing was watching.
async function adoptPod(pod: ProjectPod): Promise<boolean> {
  setPod(pod.projectId, {
    sandboxId: pod.sandboxId,
    templateId: pod.templateId,
    status: "RUNNING",
    lastUsedAt: new Date(),
  })
  setPodTemplateVersion(pod.projectId, pod.templateVersion)
  setPodStartedAt(pod.projectId, pod.startedAt)
  // Recorded at creation, so the sandbox still counts against its owner after a restart.
  if (pod.ownerId) setPodOwner(pod.projectId, pod.ownerId)
  markProjectDirty(pod.projectId)
  void watchProject(pod.projectId)
  publishSandboxEvent({ type: "sandbox.reset", projectId: pod.projectId })
  return true
}

// Takes back every running sandbox that belongs to a project after a restart.
// Never throws: if E2B can't be listed, pods are still found when their projects open.
export async function adoptRunningPods(): Promise<number> {
  let found
  try {
    found = await provider.listProjectPods()
  } catch (error) {
    console.error(
      "[adopt] could not list sandboxes at E2B; none adopted:",
      error,
    )
    return 0
  }

  // Newest first, so a duplicate keeps the one most likely to hold the latest work.
  found.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())

  let adopted = 0
  for (const pod of found) {
    const existing = getPod(pod.projectId)
    if (existing) {
      // Report, never kill: which duplicate holds what isn't something to guess about.
      if (existing.sandboxId !== pod.sandboxId) {
        console.warn(
          `[adopt] ${pod.projectId} has a second sandbox ${pod.sandboxId} besides ${existing.sandboxId}; left alone`,
        )
      }
      continue
    }

    if (await adoptPod(pod)) adopted += 1
  }

  console.log(
    `[adopt] environment "${ENV_CONFIG.SANDBOX_ENVIRONMENT}": took back ${adopted} running sandbox(es) from before the restart`,
  )
  return adopted
}

// Flushes open documents to their sandboxes, then snapshots every dirty project.
// The save work drainForShutdown races against its deadline.
async function saveEverything(projects: string[]): Promise<void> {
  const flushed = await Promise.all(
    projects.map((projectId) =>
      flushProjectDocuments(projectId).catch((error: unknown) => {
        console.error(
          `[shutdown] could not flush open documents for ${projectId}:`,
          error,
        )
        return { ok: false, failed: ["unknown"] }
      }),
    ),
  )
  const flushFailed = new Set(
    flushed
      .map((result, index) => (!result.ok ? projects[index] : undefined))
      .filter((projectId): projectId is string => Boolean(projectId)),
  )

  const dirty = projects.filter(
    (projectId) => isProjectDirty(projectId) || flushFailed.has(projectId),
  )
  const outcomes = await Promise.all(
    dirty.map((projectId) => snapshotProject(projectId, true)),
  )
  const saved = outcomes.filter((outcome) => outcome.ok).length
  console.log(
    `[shutdown] saved ${saved} of ${dirty.length} project(s) with unsaved changes`,
  )
}

// Saves what it can before this process exits, giving up at the deadline.
// Anything unfinished is saved by the next process when it adopts the sandboxes.
export async function drainForShutdown(deadlineMs: number): Promise<void> {
  const projects = listPods().map(([projectId]) => projectId)
  const startedAt = Date.now()
  const activeWorkDeadlineMs = Math.min(30_000, Math.floor(deadlineMs / 2))
  const drained = await waitForActiveProjectWork(projects, activeWorkDeadlineMs)
  if (!drained) {
    console.warn(
      `[shutdown] continuing with saves while some sandbox work is still active after ${activeWorkDeadlineMs / 1000}s`,
    )
  }

  const remainingMs = Math.max(0, deadlineMs - (Date.now() - startedAt))
  const work = saveEverything(projects)

  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), remainingMs)
  })

  const result = await Promise.race([
    work.then(() => "done" as const),
    deadline,
  ])
  clearTimeout(timer)
  if (result === "timeout") {
    console.warn(
      `[shutdown] stopped waiting after ${deadlineMs / 1000}s; unfinished saves will be made by the next process, which adopts these sandboxes`,
    )
  }
}
