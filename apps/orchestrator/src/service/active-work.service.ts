import { randomUUID } from "node:crypto"

export type ProjectWorkKind = "agent" | "dev" | "git" | "restore" | "terminal"

export interface ProjectWorkRecord {
  id: string
  kind: ProjectWorkKind
  label: string
  startedAt: number
}

interface RetirementState {
  reason: string
  drained: Promise<void>
  resolveDrained: () => void
}

export interface ProjectRetirement {
  started: boolean
  reason: string
  activeAtStart: ProjectWorkRecord[]
  waitForDrain(timeoutMs: number): Promise<boolean>
  finish(): void
}

export class ProjectRetiringError extends Error {
  constructor(
    readonly projectId: string,
    readonly reason: string,
  ) {
    super(`Project ${projectId} is retiring its sandbox: ${reason}`)
    this.name = "ProjectRetiringError"
  }
}

const active = new Map<string, Map<string, ProjectWorkRecord>>()
const retiring = new Map<string, RetirementState>()

function recordsFor(projectId: string): Map<string, ProjectWorkRecord> {
  let records = active.get(projectId)
  if (!records) {
    records = new Map()
    active.set(projectId, records)
  }
  return records
}

function resolveIfDrained(projectId: string): void {
  const state = retiring.get(projectId)
  if (state && !active.get(projectId)?.size) state.resolveDrained()
}

function wait(timeoutMs: number): Promise<"timeout"> {
  return new Promise((resolve) => {
    setTimeout(() => resolve("timeout"), timeoutMs).unref()
  })
}

export function activeProjectWork(projectId: string): ProjectWorkRecord[] {
  return [...(active.get(projectId)?.values() ?? [])]
}

export function hasActiveProjectWork(projectId: string): boolean {
  return activeProjectWork(projectId).length > 0
}

export function isProjectRetiring(projectId: string): boolean {
  return retiring.has(projectId)
}

export function projectRetiringMessage(error: unknown): string | undefined {
  return error instanceof ProjectRetiringError ? error.message : undefined
}

export async function withActiveProjectWork<T>(
  projectId: string,
  kind: ProjectWorkKind,
  label: string,
  work: () => Promise<T>,
): Promise<T> {
  const retirement = retiring.get(projectId)
  if (retirement) throw new ProjectRetiringError(projectId, retirement.reason)

  const record: ProjectWorkRecord = {
    id: randomUUID(),
    kind,
    label,
    startedAt: Date.now(),
  }
  recordsFor(projectId).set(record.id, record)

  try {
    return await work()
  } finally {
    const records = active.get(projectId)
    records?.delete(record.id)
    if (records?.size === 0) active.delete(projectId)
    resolveIfDrained(projectId)
  }
}

export function beginProjectRetirement(
  projectId: string,
  reason: string,
): ProjectRetirement {
  const existing = retiring.get(projectId)
  if (existing) {
    return {
      started: false,
      reason: existing.reason,
      activeAtStart: activeProjectWork(projectId),
      waitForDrain: async (timeoutMs) =>
        (await Promise.race([
          existing.drained.then(() => "drained"),
          wait(timeoutMs),
        ])) === "drained",
      finish: () => undefined,
    }
  }

  let resolveDrained: () => void = () => undefined
  const state: RetirementState = {
    reason,
    drained: new Promise((resolve) => {
      resolveDrained = () => resolve()
    }),
    resolveDrained,
  }
  retiring.set(projectId, state)
  resolveIfDrained(projectId)

  return {
    started: true,
    reason,
    activeAtStart: activeProjectWork(projectId),
    waitForDrain: async (timeoutMs) =>
      (await Promise.race([
        state.drained.then(() => "drained"),
        wait(timeoutMs),
      ])) === "drained",
    finish: () => {
      if (retiring.get(projectId) === state) retiring.delete(projectId)
    },
  }
}

export async function waitForActiveProjectWork(
  projectIds: string[],
  timeoutMs: number,
): Promise<boolean> {
  const uniqueProjectIds = [...new Set(projectIds)]
  const drainers = uniqueProjectIds.flatMap((projectId) => {
    const work = activeProjectWork(projectId)
    if (work.length === 0) return []
    const retirement = beginProjectRetirement(
      projectId,
      "orchestrator shutdown",
    )
    return [retirement]
  })

  try {
    const results = await Promise.all(
      drainers.map((retirement) => retirement.waitForDrain(timeoutMs)),
    )
    return results.every(Boolean)
  } finally {
    for (const retirement of drainers) retirement.finish()
  }
}
