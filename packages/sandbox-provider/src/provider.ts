// What ForgeAI needs from a sandbox provider (work plan F2, design in 09 §4). E2B is the one
// implementation today (src/e2b/); a self-hosted provider would be a second folder implementing
// the same interface. Nothing outside this package knows which provider is in use.

// ---------- SANDBOXES ----------

/** A sandbox as found by project: enough to reattach to it. */
export interface PodRef {
  sandboxId: string
  /** The image it booted from. */
  templateId: string
  /** When it was created; a provider with a lifetime limit counts from here. */
  startedAt: Date
}

/** A sandbox just created or resumed. */
export interface PodHandle {
  sandboxId: string
  templateId: string
}

/** A running sandbox that belongs to a project, as a restarted orchestrator finds it. */
export interface ProjectPod {
  projectId: string
  sandboxId: string
  /** The image it booted from. */
  templateId: string
  templateVersion?: string
  /** The workspace owner it counts against (absent on sandboxes from before E6). */
  ownerId?: string
  startedAt: Date
}

/** Recorded on a new sandbox so a restarted orchestrator knows its version and whose it is. */
export interface CreatePodTags {
  templateVersion?: string
  ownerId?: string
}

// ---------- INSIDE A SANDBOX ----------

export interface RunPodCommandOpts {
  /** Required: providers' defaults are short and kill long jobs. */
  timeoutMs: number
  /** Where it runs. Defaults to `/`, which can't be deleted by the user. */
  cwd?: string
  /** Per-command env vars; the safe way to pass secrets (not visible in `ps` or logs). */
  envs?: Record<string, string>
}

/** Exit code reported for a timed-out command, matching `timeout(1)`. */
export const COMMAND_TIMED_OUT_EXIT_CODE = 124

export interface ReadFileFromPodOpts {
  /** Refuse (FileTooLargeError) rather than load more than this many bytes. */
  maxBytes?: number
  /** Refuse (BinaryFileError) a file with a NUL byte in its first 8 KB. */
  rejectBinary?: boolean
}

export interface PodFileEntry {
  name: string
  /** Absolute path inside the sandbox. */
  path: string
  isDirectory: boolean
  size: number
  /** Epoch milliseconds, or 0 when the sandbox did not report one. */
  modifiedAt: number
}

export type PodFileChangeType =
  "create" | "write" | "remove" | "rename" | "chmod"

export interface PodFileChange {
  /** Path relative to the watched directory. */
  name: string
  type: PodFileChangeType
  /** Present when the entry still exists (absent on removes). */
  entry?: { isDirectory: boolean; size: number; modifiedAt: number }
}

export interface PodWatcher {
  stop(): Promise<void>
}

export interface WatchPodDirHandlers {
  onChange: (change: PodFileChange) => void
  onStop?: (error?: Error) => void
  /** Whether to follow subdirectories. */
  recursive?: boolean
}

export interface PodProcess {
  /** Process id inside the sandbox; also its process-group id, so `kill` takes the whole tree. */
  pid: number
  /** Kills it and everything it started. Safe to call twice. */
  kill(): Promise<void>
  /** Asks the sandbox whether it is still running, rather than trusting our own records. */
  isAlive(): Promise<boolean>
}

export interface StartPodProcessOpts {
  /** Run verbatim, through the sandbox's shell. */
  command: string
  /** Where it runs. */
  cwd?: string
  /** Extra environment variables. Passed to the process only, never written to disk. */
  envs?: Record<string, string>
  /** Everything the process prints (stdout and stderr merged, in order). */
  onOutput: (chunk: string) => void
  /** Fires once when the process has ended; `exitCode` is undefined when unknown. */
  onExit: (exitCode: number | undefined) => void
}

export interface PodTerminal {
  /** The PTY's process id inside the sandbox. */
  pid: number
  write(data: string): Promise<void>
  resize(size: { cols: number; rows: number }): Promise<void>
  /** Kills the PTY. Safe to call twice. */
  kill(): Promise<void>
}

export interface OpenPodTerminalOpts {
  cols: number
  rows: number
  /** Required: providers' defaults kill the shell. Should outlast any sandbox lifetime. */
  timeoutMs: number
  /** Where the shell starts. */
  cwd?: string
  /** Extra environment variables. Passed to the shell only, never written to disk. */
  envs?: Record<string, string>
  /** Raw PTY bytes; not decoded here because a chunk can end mid-character. */
  onData: (chunk: Uint8Array) => void
  /** Fires once, when the shell ends (exited or killed). */
  onExit: (exitCode?: number) => void
}

// ---------- IMAGES (templates:sync) ----------

/** The machine a template's sandboxes get. `diskMB` is free space after the build. */
export interface PodResources {
  cpuCount: number
  memoryMB: number
  diskMB: number
}

export interface BuildImageOpts {
  /** The Dockerfile's text (single stage). Every provider can build a Dockerfile (F8). */
  dockerfile: string
  /** The folder COPY paths in the Dockerfile are relative to (the template's folder). */
  contextDir: string
  resources?: PodResources
}

// ---------- THE PROVIDER ----------

/** What this provider does differently, so callers follow it instead of assuming E2B (F6). */
export interface SandboxCapabilities {
  /** How long a sandbox may live in total, from creation; null when there's no limit. */
  maxLifetimeMs: number | null
}

/** Everything ForgeAI does with sandboxes. Methods take the sandbox id, never credentials. */
export interface SandboxProvider {
  readonly name: SandboxProviderName
  readonly capabilities: SandboxCapabilities

  /** Boots a new sandbox for a project from an image, tagged with the environment. */
  createPod(
    projectId: string,
    image: string,
    timeoutMs: number,
    tags?: CreatePodTags,
  ): Promise<PodHandle>
  /** This environment's running sandbox for the project, if any. */
  findPodByProject(projectId: string): Promise<PodRef | undefined>
  /** Every running project sandbox of this environment (adoption after a restart). */
  listProjectPods(): Promise<ProjectPod[]>
  /** An existing sandbox's image and start time. */
  resumePod(sandboxId: string): Promise<PodHandle & { startedAt: Date }>
  isPodAlive(sandboxId: string): Promise<boolean>
  /** Pushes the sandbox's expiry out to `timeoutMs` from now. */
  keepPodAlive(sandboxId: string, timeoutMs: number): Promise<void>
  killPod(sandboxId: string): Promise<void>
  /** Drops any cached connection to the sandbox (it was replaced or released). */
  forgetPodConnection(sandboxId: string): void
  /** The public URL for a port inside the sandbox. */
  podPreviewUrl(sandboxId: string, port: number): Promise<string>

  /** Runs a one-off command; non-zero exits and timeouts come back as results, not exceptions. */
  runPodCommand(
    sandboxId: string,
    command: string,
    opts: RunPodCommandOpts,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>
  /** Starts a long-lived command (a dev server) that outlives our connection. */
  startPodProcess(
    sandboxId: string,
    opts: StartPodProcessOpts,
  ): Promise<PodProcess>
  /** Opens an interactive shell. */
  openPodTerminal(
    sandboxId: string,
    opts: OpenPodTerminalOpts,
  ): Promise<PodTerminal>
  /** Reads a text file; throws FileNotFoundError when it isn't there. */
  readFileFromPod(
    sandboxId: string,
    path: string,
    opts?: ReadFileFromPodOpts,
  ): Promise<string>
  writeFileToPod(
    sandboxId: string,
    path: string,
    content: string,
  ): Promise<void>
  /** Lists a directory; undefined when the path isn't a directory. */
  listPodFiles(
    sandboxId: string,
    path: string,
    depth: number,
  ): Promise<PodFileEntry[] | undefined>
  watchPodDir(
    sandboxId: string,
    path: string,
    handlers: WatchPodDirHandlers,
  ): Promise<PodWatcher>

  /** Whether an image with this name has been built. */
  imageExists(name: string): Promise<boolean>
  /** The tags published under an image name (empty when there's none). */
  listImageTags(name: string): Promise<string[]>
  /** Builds an image from a Dockerfile and publishes it under `name`. */
  buildImage(name: string, opts: BuildImageOpts): Promise<void>
}

// ---------- CHOOSING ONE ----------

/** The providers this package implements. */
export const SANDBOX_PROVIDERS = ["e2b"] as const
export type SandboxProviderName = (typeof SANDBOX_PROVIDERS)[number]

export interface SandboxProviderConfig {
  provider: SandboxProviderName
  /** The provider's credentials. */
  apiKey: string
  /** Tagged on every sandbox created; only sandboxes with the same tag are found or listed (E0). */
  environment: string
  /** The plan's lifetime limit (E2); null when the provider has none. */
  maxLifetimeMinutes: number | null
}
