import { ProviderCapacityError } from "@forgeAI/sandbox-provider"
import type { SandboxCapacityRefusal } from "@forgeAI/shared"

import { ENV_CONFIG } from "../envConfig.js"
import { getPodOwner, heldProjects } from "../state.js"
import { getHealthState } from "./health-state.service.js"
import { isBudgetReached } from "./spend.service.js"

// Capacity limits for new sandboxes (capacity §7.1, work plan E6). With one orchestrator, its own
// memory is the count: what it holds or is opening. A sandbox that ends leaves that state by
// itself, so nothing has to be released and nothing can leak. Stage N (N0) swaps this module's
// inside for shared Redis counts when there are several orchestrators.

/** The workspace owner a new sandbox counts against, and how many they may have at once. */
export interface SandboxOwner {
  id: string
  limit: number
}

const BUSY: SandboxCapacityRefusal = {
  reason: "busy",
  error: "All environments are busy right now. We'll keep trying.",
}

const BUDGET: SandboxCapacityRefusal = {
  reason: "budget",
  error:
    "New environments are paused until tomorrow — today's limit was reached. Environments that are already running keep working.",
}

/** Thrown when there's no room for a new sandbox; the controller answers with its refusal. */
export class SandboxCapacityError extends Error {
  constructor(readonly refusal: SandboxCapacityRefusal) {
    super(refusal.error)
  }

  /** 429 when the owner is at their limit (their fix), 503 when everything is busy (wait). */
  get status(): 429 | 503 {
    return this.refusal.reason === "owner_limit" ? 429 : 503
  }
}

// Turns a capacity failure into its refusal: our own limits, or the provider's account being full.
// Our count only sees this orchestrator's sandboxes, so other environments sharing the E2B
// account, or ones started from its dashboard, can fill it without us knowing (E9).
export function asCapacityError(
  error: unknown,
): SandboxCapacityError | undefined {
  if (error instanceof SandboxCapacityError) return error
  if (error instanceof ProviderCapacityError)
    return new SandboxCapacityError(BUSY)
  return undefined
}

// ---------- CREATION PACING (capacity §7.3, work plan E8) ----------

/** Longest a create waits for its turn before the open is answered "busy" instead. */
const MAX_CREATE_WAIT_MS = 20_000

/** When the next create may start. Creates are spaced 1 / plan.maxCreatesPerSecond apart. */
let nextCreateAt = 0

// Waits for this create's turn, so creates stay within the plan's rate (1 per second on Hobby):
// several opens, restarts or recycles at once start a moment apart instead of being refused by E2B.
// The turn is claimed before any waiting, so concurrent callers queue in order. Throws "busy" when
// the queue is longer than MAX_CREATE_WAIT_MS. In memory like the counts; stage N moves it to Redis.
export async function waitForCreateTurn(): Promise<void> {
  const now = Date.now()
  const turn = Math.max(now, nextCreateAt)
  if (turn - now > MAX_CREATE_WAIT_MS) throw new SandboxCapacityError(BUSY)
  nextCreateAt = turn + 1000 / ENV_CONFIG.SANDBOX_PLAN.maxCreatesPerSecond
  if (turn > now)
    await new Promise((resolve) => setTimeout(resolve, turn - now))
}

// Says whether a NEW sandbox may be created for this project: undefined when there's room,
// otherwise why not. Checks today's budget (E12), then the owner's limit, then the plan's usable
// slots, then this orchestrator's maximum and whether it's overloaded (E17). The project itself isn't counted. Synchronous on purpose: callers
// claim the slot (start the open) right after it, with no await between, so two opens at the same
// moment can't both take the last slot.
export function checkRoomForNewSandbox(
  projectId: string,
  owner?: SandboxOwner,
): SandboxCapacityRefusal | undefined {
  if (isBudgetReached()) return BUDGET

  const others = heldProjects().filter((id) => id !== projectId)

  if (owner) {
    const ownersProjects = others.filter((id) => getPodOwner(id) === owner.id)
    if (ownersProjects.length >= owner.limit) {
      return {
        reason: "owner_limit",
        error: `This workspace owner already has ${ownersProjects.length} environments running.`,
        projectIds: ownersProjects,
      }
    }
  }

  if (others.length >= ENV_CONFIG.SANDBOX_PLAN.usable) return BUSY
  if (others.length >= ENV_CONFIG.ORCHESTRATOR_MAX_SANDBOXES) return BUSY
  if (getHealthState() === "BUSY") return BUSY
  return undefined
}
