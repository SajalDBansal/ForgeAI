import {
  CommandExitError,
  InvalidArgumentError,
  NotEnoughSpaceError,
  NotFoundError,
  Sandbox,
  SandboxNotFoundError,
} from "e2b"

import { BinaryFileError, FileTooLargeError } from "../errors.js"

// One connected handle per sandbox. `Sandbox.connect` is an E2B API round trip, and every file
// read, listing and command used to make one first; now it happens once per sandbox.
//
// Side effect worth knowing: E2B's connect call can push a running sandbox's expiry out to its
// default (5 minutes), so every call used to extend the sandbox a little. Cached calls don't.
// Nothing relies on that: the orchestrator extends sandboxes explicitly on activity.

/** sandboxId -> the connect in flight or done; a promise so callers at the same moment share one. */
const handles = new Map<string, Promise<Sandbox>>()

// Returns the shared handle for a sandbox, connecting only when there isn't one yet.
// A failed connect isn't kept, so the next call tries again.
export function connectPod(
  apiKey: string,
  sandboxId: string,
): Promise<Sandbox> {
  const existing = handles.get(sandboxId)
  if (existing) return existing

  const connecting = Sandbox.connect(sandboxId, { apiKey })
  handles.set(sandboxId, connecting)
  connecting.catch(() => {
    if (handles.get(sandboxId) === connecting) handles.delete(sandboxId)
  })
  return connecting
}

// Stores the handle E2B returned when the sandbox was created, so its first call needs no connect.
// Called by createPod.
export function rememberPodConnection(sandbox: Sandbox): void {
  handles.set(sandbox.sandboxId, Promise.resolve(sandbox))
}

// Drops a sandbox's handle; the next call connects afresh.
// Called when the sandbox is killed or released, and when a failure suggests the handle is dead.
export function forgetPodConnection(sandboxId: string): void {
  handles.delete(sandboxId)
}

// Says whether an error is about the request (a missing file, a failed command), not the sandbox.
// After those the handle is still good; after anything else it may be dead, so it's dropped.
function isRequestError(error: unknown): boolean {
  if (error instanceof SandboxNotFoundError) return false
  return (
    error instanceof CommandExitError ||
    error instanceof NotFoundError ||
    error instanceof InvalidArgumentError ||
    error instanceof NotEnoughSpaceError ||
    error instanceof FileTooLargeError ||
    error instanceof BinaryFileError
  )
}

// Runs one call on a sandbox's shared handle, dropping the handle if the call fails in a way
// that suggests the sandbox is gone (expired, killed, unreachable).
export async function withPod<T>(
  apiKey: string,
  sandboxId: string,
  use: (sandbox: Sandbox) => Promise<T>,
): Promise<T> {
  const sandbox = await connectPod(apiKey, sandboxId)
  try {
    return await use(sandbox)
  } catch (error) {
    if (!isRequestError(error)) forgetPodConnection(sandboxId)
    throw error
  }
}
