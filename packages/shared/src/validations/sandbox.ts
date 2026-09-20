import z from "zod"

import { resolveProjectPath } from "../types/files.js"

import {
  SECRET_KEY_MAX,
  SECRET_KEY_PATTERN,
  SECRET_VALUE_MAX,
} from "./build.js"
import { devCommand, devPort } from "./terminal.js"

/**
 * A project's RUNTIME secrets, decrypted, as api-server sends them to the orchestrator (I1).
 * They become environment variables of the dev server; never written to disk.
 */
export const projectSecretsSchema = z.record(
  z.string().regex(SECRET_KEY_PATTERN).max(SECRET_KEY_MAX),
  z.string().max(SECRET_VALUE_MAX),
)

export const podStatusSchema = z.enum(["RUNNING", "PAUSED"])

/** Opening a pod needs only the image; the dev port travels with `dev.start`. */
export const ensurePodSchema = z.object({
  templateId: z.string().trim().min(1, "Template id is required"),
  /** Recorded on snapshots so a restore can use the matching image. */
  templateVersion: z.string().trim().min(1).optional(),
  /**
   * The workspace owner (who pays). A new sandbox counts against their limit (capacity §5).
   * api-server always sends both; optional so an older api-server mid-deploy still works.
   */
  ownerId: z.string().trim().min(1).optional(),
  /** How many sandboxes the owner may have at once (OWNER_MAX_SANDBOXES until billing exists). */
  ownerLimit: z.number().int().min(1).optional(),
  /** The project's RUNTIME secrets (I1). Optional so an older api-server mid-deploy still works. */
  secrets: projectSecretsSchema.optional(),
})

/** PUT /sandbox/:projectId/secrets: the full current set, sent whenever a secret changes (I1). */
export const setPodSecretsSchema = z.object({ secrets: projectSecretsSchema })

/** The Start dialog's save; reuses the socket command's field rules. */
export const setDevCommandSchema = z.object({
  command: devCommand,
  port: devPort,
})

/** A path inside the project, refused at the edge with a clear 400. */
const projectFilePath = z
  .string()
  .trim()
  .min(1, "File path is required")
  .refine(
    (path) => resolveProjectPath(path) !== undefined,
    "That path is outside the project",
  )

// ---------- GIT ----------

const gitSha = z.string().regex(/^[0-9a-f]{40}$/, "Not a commit id")

/** The project's GitHub remote, sent with every git request so a fresh sandbox needs no state. */
export const gitRemoteSchema = z.object({
  cloneUrl: z.string().url().startsWith("https://github.com/"),
  /** A one-hour token for this repository only. */
  token: z.string().min(1),
  branch: z.string().min(1).max(255),
  /** The commit ForgeAI last saw on GitHub. */
  lastKnownSha: gitSha,
})

const gitAuthorSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().min(3).max(320),
})

export const gitPrepareSchema = z.object({ remote: gitRemoteSchema })

export const gitCommitSchema = z.object({
  remote: gitRemoteSchema,
  /** The whole message, co-author line included. */
  message: z.string().min(1).max(10_000),
  author: gitAuthorSchema,
})

export const gitRollbackSchema = gitCommitSchema.extend({ sha: gitSha })

/** How to resolve GitHub having moved. */
export const shiftChoiceSchema = z.enum(["theirs", "merge", "mine"])

/** For "merge": who wins each file both sides changed on the same lines. */
export const shiftPickSchema = z.object({
  path: z.string().min(1).max(4096),
  keep: z.enum(["mine", "theirs"]),
})

export const gitCheckSchema = z.object({ remote: gitRemoteSchema })

export const gitResolveSchema = z.object({
  remote: gitRemoteSchema,
  choice: shiftChoiceSchema,
  /** The GitHub commit the person was shown. If GitHub moved again since, nothing happens. */
  expectHead: gitSha,
  picks: z.array(shiftPickSchema).max(1000).default([]),
  /** For "mine", which commits: the whole message, co-author line included. */
  message: z.string().min(1).max(10_000).optional(),
  author: gitAuthorSchema.optional(),
})

export const gitRestoreFileSchema = z.object({
  backup: gitSha,
  path: z.string().min(1).max(4096),
})

/** What the browser sends to resolve a shift. */
export const resolveShiftSchema = z.object({
  choice: shiftChoiceSchema,
  expectHead: gitSha,
  picks: z.array(shiftPickSchema).max(1000).default([]),
})

export const restoreShiftFileSchema = gitRestoreFileSchema

export type ShiftChoice = z.infer<typeof shiftChoiceSchema>
export type ShiftPick = z.infer<typeof shiftPickSchema>
export type GitRemote = z.infer<typeof gitRemoteSchema>
export type GitAuthor = z.infer<typeof gitAuthorSchema>

/** Put one commit's files back into the sandbox, for a rollback. */
export const restoreCommitSchema = z.object({
  commitId: z.string().trim().min(1),
})

export const readPodFileQuerySchema = z.object({
  path: projectFilePath,
})

/** The agent worker acting on a run's project as the person who asked (I5b, api-server's internal route). */
export const agentProjectActorSchema = z.object({
  userId: z.string().trim().min(1),
})

export const openSandboxForAgentSchema = agentProjectActorSchema

/** Listing a folder (the root when `path` is omitted). Depth is capped to keep listings small. */
export const listPodFilesQuerySchema = z.object({
  path: projectFilePath.optional(),
  // 2 is all the tree asks for; deeper requests would walk far into node_modules on E2B.
  depth: z.coerce.number().int().min(1).max(2).default(1),
})

/** Largest file the save route accepts: the size the editor opens (EDITOR_MAX_FILE_BYTES' default). */
export const FILE_WRITE_MAX_CHARS = 2 * 1024 * 1024

/**
 * Request body limit for the save route in api-server and the orchestrator (Fastify `bodyLimit`).
 * Above FILE_WRITE_MAX_CHARS because JSON escaping and multi-byte characters grow the content;
 * every other route keeps its service's smaller default.
 */
export const FILE_WRITE_BODY_LIMIT_BYTES = 5 * 1024 * 1024

export const writePodFileSchema = z.object({
  path: projectFilePath,
  content: z
    .string()
    .max(FILE_WRITE_MAX_CHARS, "This file is too big to save here"),
})

// ---------- AGENT TOOLS ----------

const agentRunId = z.string().trim().min(1, "Run id is required")
const agentStepSeq = z.coerce.number().int().min(1, "Step sequence is required")

/** POST /sandbox/:projectId/exec: a one-off command run by the agent (I7). */
export const agentExecSchema = z.object({
  runId: agentRunId,
  seq: agentStepSeq,
  command: z.string().trim().min(1, "Command is required").max(10_000),
  /** Project-relative working directory. Omitted means the project root. */
  cwd: projectFilePath.optional(),
  timeoutMs: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
})

/** POST /sandbox/:projectId/fs/edit: full replacement, or one exact search/replace. */
export const agentEditFileSchema = z
  .object({
    runId: agentRunId,
    seq: agentStepSeq,
    path: projectFilePath,
    content: z
      .string()
      .max(FILE_WRITE_MAX_CHARS, "This file is too big to save here")
      .optional(),
    search: z.string().min(1, "Search text cannot be empty").optional(),
    replace: z
      .string()
      .max(FILE_WRITE_MAX_CHARS, "Replacement is too large")
      .optional(),
  })
  .refine(
    (data) =>
      data.content !== undefined ||
      (data.search !== undefined && data.replace !== undefined),
    {
      message: "Provide content, or search and replace",
    },
  )

/** GET /sandbox/:projectId/search: ripgrep in the project sandbox. */
export const agentSearchQuerySchema = z.object({
  query: z.string().trim().min(1, "Search query is required").max(500),
  maxResults: z.coerce.number().int().min(1).max(100).default(50),
})

/** POST /sandbox/:projectId/checkpoint: local-only git checkpoint for rollback. */
export const agentCheckpointSchema = z.object({
  runId: agentRunId,
  seq: z.coerce.number().int().min(-1, "Step sequence is required"),
  message: z.string().trim().min(1, "Checkpoint message is required").max(500),
})

/** POST /sandbox/:projectId/diff-checkpoint: changed files since a local-only agent checkpoint. */
export const agentCheckpointDiffSchema = z.object({
  commit: gitSha,
})

/** POST /sandbox/:projectId/restore-checkpoint: put files back to a local-only agent checkpoint. */
const agentCheckpointArtifactSchema = z.object({
  key: z.string().trim().min(1).max(1_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().min(1),
})

export const agentCheckpointRestoreSchema = z.object({
  beforeCommit: gitSha,
  afterCommit: gitSha,
  beforeArtifact: agentCheckpointArtifactSchema,
  afterArtifact: agentCheckpointArtifactSchema,
  paths: z
    .array(projectFilePath)
    .max(500, "Too many files changed to undo safely"),
})

/** POST /sandbox/:projectId/dev/start: start the shared dev server for an agent tool. */
export const agentDevStartSchema = z.object({
  runId: agentRunId,
  seq: agentStepSeq,
  command: devCommand,
  port: devPort,
  installCommand: z.string().trim().min(1).max(500).optional(),
})

/** POST /sandbox/:projectId/dev/stop: stop the shared dev server for an agent tool. */
export const agentDevStopSchema = z.object({
  runId: agentRunId,
  seq: agentStepSeq,
})
