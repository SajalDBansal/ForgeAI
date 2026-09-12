import {
  CommandExitError,
  NotFoundError,
  RateLimitError,
  Sandbox,
  TimeoutError,
} from "e2b"

import {
  forgetPodConnection,
  rememberPodConnection,
  withPod,
} from "./connection.js"
import {
  BinaryFileError,
  FileNotFoundError,
  FileTooLargeError,
  ProviderCapacityError,
} from "../errors.js"
import {
  COMMAND_TIMED_OUT_EXIT_CODE,
  type CreatePodTags,
  type PodFileChangeType,
  type PodFileEntry,
  type PodHandle,
  type PodRef,
  type PodWatcher,
  type ProjectPod,
  type ReadFileFromPodOpts,
  type RunPodCommandOpts,
  type WatchPodDirHandlers,
} from "../provider.js"

// E2B's implementation of the sandbox parts of SandboxProvider. Each function takes the API key
// first; src/e2b/index.ts binds it so callers never see it.

// Picks the image name a sandbox booted from, preferring our recorded metadata.
// E2B reports its internal template id, which can't be booted again by name.
function bootedImage(info: {
  metadata?: Record<string, string>
  templateId: string
}): string {
  return info.metadata?.image ?? info.templateId
}

// Converts E2B's optional modified time into epoch milliseconds (0 when missing).
// Shared by directory listings and file-watch events.
function toEpochMs(modifiedTime: Date | string | undefined): number {
  return modifiedTime ? new Date(modifiedTime).getTime() : 0
}

// Finds this environment's running sandbox for the project, if any.
// Used when opening a project to reattach instead of booting a new sandbox.
export async function findPodByProject(
  apiKey: string,
  environment: string,
  projectId: string,
): Promise<PodRef | undefined> {
  const page = Sandbox.list({
    apiKey,
    query: { metadata: { env: environment, projectId } },
    limit: 1,
  })
  if (!page.hasNext) return undefined
  const [info] = await page.nextItems()
  return (
    info && {
      sandboxId: info.sandboxId,
      templateId: bootedImage(info),
      startedAt: new Date(info.startedAt),
    }
  )
}

// Boots a new sandbox for a project from the given image, tagged with its environment.
// `timeoutMs` is required because E2B's short default silently kills sandboxes.
export async function createPod(
  apiKey: string,
  /** Which orchestrator's sandbox this is (staging, production, local-<computer>). */
  environment: string,
  projectId: string,
  templateId: string,
  timeoutMs: number,
  /** Recorded on the sandbox so a restarted orchestrator knows its version and whose it is. */
  { templateVersion, ownerId }: CreatePodTags = {},
): Promise<PodHandle> {
  const metadata: Record<string, string> = {
    env: environment,
    projectId,
    image: templateId,
  }
  if (templateVersion) metadata.templateVersion = templateVersion
  if (ownerId) metadata.ownerId = ownerId
  let sandbox: Sandbox
  try {
    sandbox = await Sandbox.create(templateId, { apiKey, metadata, timeoutMs })
  } catch (error) {
    // E2B's account is full (or we're creating too fast): "busy", not a failure (E9).
    if (error instanceof RateLimitError) throw new ProviderCapacityError(error)
    throw error
  }
  rememberPodConnection(sandbox)
  return { sandboxId: sandbox.sandboxId, templateId }
}

// Lists this environment's running project sandboxes under the API key. Other environments'
// sandboxes on the same account are never returned, so they're never adopted or reaped.
// Lets a restarted orchestrator re-adopt sandboxes it lost track of.
export async function listProjectPods(
  apiKey: string,
  environment: string,
): Promise<ProjectPod[]> {
  const paginator = Sandbox.list({
    apiKey,
    query: { state: ["running"], metadata: { env: environment } },
  })
  const pods: ProjectPod[] = []

  while (paginator.hasNext) {
    for (const info of await paginator.nextItems()) {
      const projectId = info.metadata?.projectId
      if (!projectId) continue
      pods.push({
        projectId,
        sandboxId: info.sandboxId,
        templateId: bootedImage(info),
        ...(info.metadata.templateVersion && {
          templateVersion: info.metadata.templateVersion,
        }),
        ...(info.metadata.ownerId && { ownerId: info.metadata.ownerId }),
        startedAt: new Date(info.startedAt),
      })
    }
  }

  return pods
}

// Pushes a sandbox's expiry back out to the full window.
// Called on activity so an open editor's sandbox doesn't expire underneath it.
export async function keepPodAlive(
  apiKey: string,
  sandboxId: string,
  timeoutMs: number,
): Promise<void> {
  await Sandbox.setTimeout(sandboxId, timeoutMs, { apiKey })
}

// Checks whether E2B still has this sandbox running.
// Used before handing back a remembered pod, since expiry isn't pushed to us.
export async function isPodAlive(
  apiKey: string,
  sandboxId: string,
): Promise<boolean> {
  try {
    const alive = await withPod(apiKey, sandboxId, (sandbox) =>
      sandbox.isRunning(),
    )
    if (!alive) forgetPodConnection(sandboxId)
    return alive
  } catch {
    return false
  }
}

// Loads an existing sandbox's image and start time.
// Used when reattaching to a sandbox found by id.
export async function resumePod(
  apiKey: string,
  sandboxId: string,
): Promise<PodHandle & { startedAt: Date }> {
  const info = await Sandbox.getInfo(sandboxId, { apiKey })
  return {
    sandboxId,
    templateId: bootedImage(info),
    startedAt: new Date(info.startedAt),
  }
}

// Returns the public URL for a port inside the sandbox.
// Used when a dev server starts; safe to call before the port is listening.
export async function podPreviewUrl(
  apiKey: string,
  sandboxId: string,
  port: number,
): Promise<string> {
  return withPod(
    apiKey,
    sandboxId,
    async (sandbox) => `https://${sandbox.getHost(port)}`,
  )
}

// Runs a one-off command in a sandbox and returns its output and exit code.
// Non-zero exits and timeouts come back as results, not exceptions.
export async function runPodCommand(
  apiKey: string,
  sandboxId: string,
  command: string,
  { timeoutMs, cwd = "/", envs }: RunPodCommandOpts,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return withPod(apiKey, sandboxId, async (sandbox) => {
    try {
      const result = await sandbox.commands.run(command, {
        cwd,
        timeoutMs,
        ...(envs && { envs }),
      })
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      }
    } catch (error) {
      if (error instanceof CommandExitError) {
        return {
          stdout: error.stdout,
          stderr: error.stderr,
          exitCode: error.exitCode,
        }
      }
      if (error instanceof TimeoutError) {
        // Usually the command's own budget, but a dead sandbox looks the same: reconnect next time.
        forgetPodConnection(sandboxId)
        return {
          stdout: "",
          stderr: `timed out after ${Math.round(timeoutMs / 1000)}s (${error.message})`,
          exitCode: COMMAND_TIMED_OUT_EXIT_CODE,
        }
      }
      throw error
    }
  })
}

// Destroys a sandbox.
// Used by the reaper and when a pod is replaced.
export async function killPod(
  apiKey: string,
  sandboxId: string,
): Promise<void> {
  forgetPodConnection(sandboxId)
  await Sandbox.kill(sandboxId, { apiKey })
}

/** How much of a file is checked for a NUL byte; the same rule git uses to call a file binary. */
const BINARY_SNIFF_BYTES = 8 * 1024

// Reads a text file from inside a sandbox, optionally refusing big or binary files.
// A missing file throws our FileNotFoundError, not E2B's, so callers stay provider-neutral (F5).
export async function readFileFromPod(
  apiKey: string,
  sandboxId: string,
  path: string,
  { maxBytes, rejectBinary = false }: ReadFileFromPodOpts = {},
): Promise<string> {
  try {
    return await withPod(apiKey, sandboxId, async (sandbox) => {
      if (maxBytes === undefined && !rejectBinary)
        return sandbox.files.read(path)
      return readCapped(sandbox, path, maxBytes, rejectBinary)
    })
  } catch (error) {
    if (error instanceof NotFoundError) throw new FileNotFoundError(path)
    throw error
  }
}

// Streams a file, refusing it once it passes `maxBytes` or shows a NUL byte in its first 8 KB.
// The body of readFileFromPod's limited path.
async function readCapped(
  sandbox: Sandbox,
  path: string,
  maxBytes: number | undefined,
  rejectBinary: boolean,
): Promise<string> {
  // Cheap check first, so the common refusal reports the real size and downloads nothing.
  if (maxBytes !== undefined) {
    const info = await sandbox.files.getInfo(path)
    if (info.size > maxBytes)
      throw new FileTooLargeError(path, info.size, maxBytes, true)
  }

  // The file can grow between the check and the read (a log being written), and a symlink
  // reports its own size, so the read itself is capped too.
  const reader = (
    await sandbox.files.read(path, { format: "stream" })
  ).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      // Only the first 8 KB is checked, wherever the chunk boundaries fall.
      const unsniffed = BINARY_SNIFF_BYTES - total
      if (
        rejectBinary &&
        unsniffed > 0 &&
        value.subarray(0, unsniffed).includes(0)
      ) {
        throw new BinaryFileError(path)
      }
      total += value.byteLength
      if (maxBytes !== undefined && total > maxBytes)
        throw new FileTooLargeError(path, total, maxBytes, false)
      chunks.push(value)
    }
  } finally {
    // Stops the download early on a refusal; a no-op once the stream is finished.
    await reader.cancel().catch(() => undefined)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

// Writes a text file inside a sandbox.
// Backs the file endpoints and shared-document saves.
export async function writeFileToPod(
  apiKey: string,
  sandboxId: string,
  path: string,
  content: string,
): Promise<void> {
  await withPod(apiKey, sandboxId, (sandbox) =>
    sandbox.files.write(path, content),
  )
}

// Lists a sandbox directory up to `depth` levels deep.
// Returns undefined when the path isn't a directory, so file trees can handle it.
export async function listPodFiles(
  apiKey: string,
  sandboxId: string,
  path: string,
  depth: number,
): Promise<PodFileEntry[] | undefined> {
  try {
    const entries = await withPod(apiKey, sandboxId, (sandbox) =>
      sandbox.files.list(path, { depth }),
    )
    return entries.map((entry) => ({
      name: entry.name,
      path: entry.path,
      // Anything that isn't a directory (including symlinks) is treated as a file.
      isDirectory: entry.type === "dir",
      size: entry.size,
      modifiedAt: toEpochMs(entry.modifiedTime),
    }))
  } catch (error) {
    const name = (error as { name?: string }).name
    if (
      name === "NotFoundError" ||
      name === "FileNotFoundError" ||
      name === "InvalidArgumentError"
    )
      return undefined
    throw error
  }
}

// Watches a sandbox directory for changes for as long as the sandbox lives.
// Callers choose `recursive` carefully: one npm install emits tens of thousands of events.
export async function watchPodDir(
  apiKey: string,
  sandboxId: string,
  path: string,
  handlers: WatchPodDirHandlers,
): Promise<PodWatcher> {
  const handle = await withPod(apiKey, sandboxId, (sandbox) =>
    sandbox.files.watchDir(
      path,
      (event) => {
        handlers.onChange({
          name: event.name,
          type: event.type as PodFileChangeType,
          ...(event.entry && {
            entry: {
              isDirectory: event.entry.type === "dir",
              size: event.entry.size,
              modifiedAt: toEpochMs(event.entry.modifiedTime),
            },
          }),
        })
      },
      {
        // 0 = no timeout; E2B's default silently stops the watch after 60 s.
        timeoutMs: 0,
        recursive: handlers.recursive ?? true,
        includeEntry: true,
        ...(handlers.onStop && { onExit: handlers.onStop }),
      },
    ),
  )

  return {
    async stop() {
      await handle.stop().catch(() => undefined)
    },
  }
}
