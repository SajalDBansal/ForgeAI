import z from "zod"
import type { IgnoredFolderKind } from "./ignored-folders.js"
import type { SnapshotStatus } from "./snapshot.js"
import type { DevServerState } from "./terminal.js"
import {
  agentCheckpointDiffSchema,
  agentCheckpointRestoreSchema,
  agentCheckpointSchema,
  agentDevStartSchema,
  agentDevStopSchema,
  agentEditFileSchema,
  agentExecSchema,
  agentSearchQuerySchema,
  ensurePodSchema,
  listPodFilesQuerySchema,
  podStatusSchema,
  readPodFileQuerySchema,
  setDevCommandSchema,
  writePodFileSchema,
} from "../validations/sandbox.js"

export type PodStatus = z.infer<typeof podStatusSchema>
export type EnsurePodDataType = z.infer<typeof ensurePodSchema>
export type ReadPodFileQuery = z.infer<typeof readPodFileQuerySchema>
export type ListPodFilesQuery = z.infer<typeof listPodFilesQuerySchema>
export type WritePodFileDataType = z.infer<typeof writePodFileSchema>
export type SetDevCommandDataType = z.infer<typeof setDevCommandSchema>
export type AgentExecDataType = z.infer<typeof agentExecSchema>
export type AgentEditFileDataType = z.infer<typeof agentEditFileSchema>
export type AgentSearchQuery = z.infer<typeof agentSearchQuerySchema>
export type AgentCheckpointDataType = z.infer<typeof agentCheckpointSchema>
export type AgentCheckpointDiffDataType = z.infer<
  typeof agentCheckpointDiffSchema
>
export type AgentCheckpointRestoreDataType = z.infer<
  typeof agentCheckpointRestoreSchema
>
export type AgentDevStartDataType = z.infer<typeof agentDevStartSchema>
export type AgentDevStopDataType = z.infer<typeof agentDevStopSchema>

/** One entry in a folder listing. `path` is project-relative (`app/page.tsx`). */
export type PodFile = {
  name: string
  path: string
  isDirectory: boolean
  size: number
  /** Epoch milliseconds; 0 when the sandbox did not report one. */
  modifiedAt: number
  /** Set on an ignored folder (node_modules, .next…): shown greyed and closed, never listed inside. */
  hidden?: IgnoredFolderKind
}

/** A folder listing. Folders with more entries than the tree shows are cut, and say by how much. */
export type PodFileListing = {
  files: PodFile[]
  /** Project-relative folder -> how many of its entries weren't sent (the root is `""`). */
  truncated: Record<string, number>
}

export type PodRecord = {
  sandboxId: string
  templateId: string
  status: PodStatus
  lastUsedAt: Date
}

/** Where the dev server stands; also sent on ensure so a freshly opened tab doesn't flash "stopped". */
export type DevServerStatus = {
  state: DevServerState
  /** Present when `state` is `live`. */
  previewUrl?: string
  /** Who pressed Start. Absent when nothing is running. */
  startedBy?: string
}

export type EnsurePodResponse = PodRecord & {
  /** True only for the request that created the pod; drives the "environment ready" notice. */
  created: boolean
  /** The template's display name, added by api-server. */
  templateName?: string
  dev: DevServerStatus
  /** Save status, including any large deletion awaiting confirmation. */
  snapshot: SnapshotStatus
}

export type PreviewLinkStatus = {
  /** Authenticated ForgeAI proxy URL used by the builder iframe. */
  previewUrl: string
  /** True when the current sandbox dev server is live and can be proxied. */
  devLive: boolean
  /** True when anyone with the public URL may open the preview. */
  globalEnabled: boolean
  /** Stable public URL once the project has ever created one. */
  globalUrl?: string
}

/**
 * Why no new sandbox can be created right now (capacity §7.6). The orchestrator answers 429
 * for `owner_limit`, and 503 for `busy` and `budget` (today's spend limit is used up).
 * Reopening a sandbox that's running is never refused.
 */
export type SandboxCapacityRefusal = {
  reason: "owner_limit" | "busy" | "budget"
  error: string
  /** owner_limit: the owner's projects that hold sandboxes, so one can be closed. */
  projectIds?: string[]
}

/** What the Start dialog shows, and where each part came from. */
export type DevCommandSettings = {
  /** What will actually run: the override if set, otherwise the template's. */
  devCommand: string
  devPort: number
  /** Whether "Reset to template default" should be offered. */
  isOverride: boolean
  /** Who set the override. Null when there is none or the account is gone. */
  changedBy: { id: string; name: string } | null
  templateDefault: { devCommand: string; devPort: number }
  /** The template's install command, quoted in "missing module" errors. Never run. */
  installCommand: string | null
}

// ---------- AGENT TOOLS ----------

export type AgentExecResult = {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
}

export type AgentEditFileResult = {
  path: string
  changed: boolean
  openDocument: boolean
}

export type AgentSearchMatch = {
  path: string
  line: number
  text: string
}

export type AgentSearchResult = {
  hits: AgentSearchMatch[]
  truncated: boolean
}

export type AgentCheckpointResult = {
  commit: string
  artifact: AgentCheckpointArtifact
}

export type AgentCheckpointArtifact = {
  key: string
  sha256: string
  bytes: number
}

export type AgentFileChangeStat = {
  path: string
  action: "created" | "updated" | "deleted"
  additions: number
  deletions: number
}

export type AgentCheckpointDiffResult = {
  files: AgentFileChangeStat[]
  additions: number
  deletions: number
}

export type AgentCheckpointRestoreResult = {
  restored: boolean
  conflicts?: string[]
}

export type AgentDevServerResult = {
  state: DevServerState
  previewUrl?: string
  message?: string
  logs: string
}

// ---------- GIT ----------

/** One file in a commit, from `git show --numstat`. Binary files count 0 lines. */
export type CommitFileStat = {
  path: string
  additions: number
  deletions: number
}

/** A commit made in the sandbox and pushed to GitHub. */
export type GitCommitResult = {
  sha: string
  files: CommitFileStat[]
  additions: number
  deletions: number
}

/** How GitHub's branch moved since ForgeAI's last commit: pushed on top, or force-pushed. */
export type GitShift = { kind: "ahead" | "rewritten"; githubHead: string }

/** A commit on GitHub, as git reports it. */
export type GitCommitInfo = {
  sha: string
  authorName: string
  authorEmail: string
  date: string
  message: string
  files: CommitFileStat[]
}

/** What changed on GitHub since ForgeAI's last commit, and where it clashes with local edits. */
export type GitShiftDetails = {
  kind: "ahead" | "rewritten"
  githubHead: string
  commits: GitCommitInfo[]
  files: CommitFileStat[]
  localChanges: string[]
  /** Files changed on both sides; `conflict` when the same lines changed. */
  overlaps: { path: string; conflict: boolean }[]
}

export type GitCheckResult =
  { state: "same"; githubHead: string } | ({ state: "shift" } & GitShiftDetails)

/** What resolving a shift did. */
export type GitResolveResult = {
  /** What the project is now based on. */
  newBase: string
  /** Where everything that was here before is saved. */
  backup: string
  /** Files whose local changes gave way to GitHub's; restorable from `backup`. */
  replaced: string[]
  /** Files where local changes were kept. */
  kept: string[]
  /** Files merged line by line. */
  merged: string[]
  /** GitHub's commits that were brought in, oldest first. */
  commits: GitCommitInfo[]
  /** For "keep my version": the commit that put the files back. */
  commit?: GitCommitResult
}

/** Why a git request did nothing. Answered as 409 with this in `reason`. */
export type GitRefusal =
  | { reason: "unchanged" }
  | { reason: "shift"; shift: GitShift }
  | { reason: "rejected" }
  | { reason: "unreachable"; detail: string }
  | { reason: "too_large"; files: string[] }
  | { reason: "no_git" }
  | { reason: "unknown_commit" }
  /** Owner Git credentials would enter the sandbox while runtime/agent work is active. */
  | { reason: "privileged_busy"; blockers: string[] }
  /** GitHub moved again after the person was shown the shift. */
  | { reason: "moved"; githubHead: string }

// ---------- TIMEOUTS ----------
// Each layer is derived from the one inside it: a transfer fits in its command,
// a command fits in its request. Change one and the others follow.

/** One upload or download between a sandbox and R2 (`curl --max-time`), in seconds. */
export const SANDBOX_TRANSFER_TIMEOUT_S = 240

/** Room in each command for tarring, extracting and diffing around its transfers. */
const COMMAND_OVERHEAD_MS = 60_000

/** The `timeoutMs` passed to E2B per command kind, so nothing inherits E2B's 60 s default. */
export const SANDBOX_COMMAND_TIMEOUT_MS = {
  /** A quick question like `ss` or `kill`. */
  quick: 15_000,
  /** Tar the source and upload it: one transfer. */
  snapshot: SANDBOX_TRANSFER_TIMEOUT_S * 1_000 + COMMAND_OVERHEAD_MS,
  /** Download a snapshot and extract it: one transfer. */
  restore: SANDBOX_TRANSFER_TIMEOUT_S * 1_000 + COMMAND_OVERHEAD_MS,
  /** Tar, fetch the previous commit, diff, upload: two transfers. */
  commit: 2 * SANDBOX_TRANSFER_TIMEOUT_S * 1_000 + COMMAND_OVERHEAD_MS,
  /** A git fetch and a push: two transfers. */
  git: 2 * SANDBOX_TRANSFER_TIMEOUT_S * 1_000 + COMMAND_OVERHEAD_MS,
} as const

/** Creating a sandbox, plus a fallback to a second image if the first fails. */
const POD_CREATE_BUDGET_MS = 120_000

/** Longest a single orchestrator request may run; the worst case is a restart (snapshot + create + restore). */
export const ORCHESTRATOR_REQUEST_TIMEOUT_MS =
  SANDBOX_COMMAND_TIMEOUT_MS.snapshot +
  POD_CREATE_BUDGET_MS +
  SANDBOX_COMMAND_TIMEOUT_MS.restore

/** A link to a project's current source, for the knowledge graph (work plan Q5). */
export interface RagSource {
  /** A short-lived GET link to the project's source as a .tar.gz. */
  url: string
  /** The archive's ETag: the same as at the last index means nothing changed. */
  etag: string
  expiresInSeconds: number
  /** True when it's the copy held for a large-deletion confirmation, not the live one. */
  held: boolean
}
