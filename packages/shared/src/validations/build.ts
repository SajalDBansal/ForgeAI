import z from "zod"

// ---------- CHAT ----------
export const chatRoleSchema = z.enum(["USER", "AGENT", "SYSTEM"])

export const chatMessageKindSchema = z.enum([
  "TEXT",
  "TASK",
  "QUESTION",
  "PERMISSION",
  "FILES",
  "WARNING",
  "SUCCESS",
  "REPO_PUSH",
  "PR_PROMPT",
])

export const fileChangeSchema = z.object({
  path: z.string().min(1),
  action: z.enum(["created", "updated", "deleted"]),
  additions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
})

/** Kind-specific data stored in ChatMessage.payload. */
export const chatMessagePayloadSchema = z.object({
  tasks: z
    .array(
      z.object({
        label: z.string(),
        status: z.enum(["done", "active", "pending"]),
      }),
    )
    .optional(),
  options: z.array(z.string()).optional(),
  files: z.array(fileChangeSchema).optional(),
  permissionTitle: z.string().optional(),
  permissionDetail: z.string().optional(),
  repoPath: z.string().optional(),
  commitHash: z.string().optional(),
  fileCount: z.number().int().nonnegative().optional(),
  prBranch: z.string().optional(),
})

export const createChatMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message can't be empty")
    .max(10_000, "Message is too long"),
})

export const listChatMessagesQuerySchema = z.object({
  /** Cursor: return messages created before this message id. */
  before: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

// ---------- TEAM CHAT ----------
/** How many team messages one page holds. */
export const TEAM_CHAT_PAGE_SIZE = 50

export const createTeamMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message can't be empty")
    .max(5_000, "Message is too long"),
  /** Who the message tags with "@". Anyone not on the project is dropped. */
  mentions: z.array(z.string().min(1).max(100)).max(50).default([]),
})

export const listTeamMessagesQuerySchema = z.object({
  /** Cursor: return messages numbered below this `seq`. */
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(TEAM_CHAT_PAGE_SIZE),
})

/** "I have read up to here." Only ever moves forward. */
export const markTeamChatReadSchema = z.object({
  seq: z.number().int().nonnegative(),
})

// ---------- SECRETS ----------
export const secretScopeSchema = z.enum(["RUNTIME", "BUILD"])

/** A secret's name: usable as an environment variable. */
export const SECRET_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/
export const SECRET_KEY_MAX = 128
export const SECRET_VALUE_MAX = 10_000

export const upsertProjectSecretSchema = z.object({
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      SECRET_KEY_PATTERN,
      "Use letters, digits and underscores, e.g. STRIPE_SECRET_KEY",
    )
    .max(SECRET_KEY_MAX, "Key is too long"),
  value: z
    .string()
    .min(1, "Value is required")
    .max(SECRET_VALUE_MAX, "Value is too long"),
  scope: secretScopeSchema.default("RUNTIME"),
})

// ---------- HISTORY ----------
/** The Commit dialog's input: only the message, everything else is measured. */
export const commitProjectSchema = z.object({
  message: z.string().trim().min(1, "Say what changed").max(500),
})

export const recordProjectCommitSchema = z.object({
  hash: z.string().trim().min(1),
  author: z.string().trim().min(1),
  prompt: z.string(),
  filesChanged: z.number().int().nonnegative().default(0),
  additions: z.number().int().nonnegative().default(0),
  deletions: z.number().int().nonnegative().default(0),
})

// ---------- INFORMATION ----------
const labelValueSchema = z.object({ label: z.string(), value: z.string() })

/** The Information tab, stored as one JSON document in ProjectInfo.data. */
export const projectInfoSchema = z.object({
  brief: z.array(labelValueSchema).default([]),
  planSteps: z
    .array(
      z.object({
        label: z.string(),
        status: z.enum(["done", "active", "pending"]),
      }),
    )
    .default([]),
  requirements: z.array(labelValueSchema).default([]),
  timeline: z
    .array(z.object({ at: z.string(), label: z.string() }))
    .default([]),
  filesChanged: z.array(fileChangeSchema).default([]),
  dependencies: z
    .array(z.object({ name: z.string(), version: z.string() }))
    .default([]),
  colors: z.array(z.object({ name: z.string(), hex: z.string() })).default([]),
  disclaimers: z.array(z.string()).default([]),
  sessionId: z.string().nullable().default(null),
})

/** A partial update: each section present replaces the stored one. */
export const updateProjectInfoSchema = projectInfoSchema.partial()
