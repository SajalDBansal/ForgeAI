import z from "zod"
import type { CommitFileStat, DevCommandSettings } from "./sandbox.js"
import {
  chatMessageKindSchema,
  commitProjectSchema,
  chatMessagePayloadSchema,
  chatRoleSchema,
  createChatMessageSchema,
  createTeamMessageSchema,
  fileChangeSchema,
  listChatMessagesQuerySchema,
  listTeamMessagesQuerySchema,
  markTeamChatReadSchema,
  projectInfoSchema,
  recordProjectCommitSchema,
  secretScopeSchema,
  updateProjectInfoSchema,
  upsertProjectSecretSchema,
} from "../validations/build.js"
import { Project } from "./project.js"

export type ChatRole = z.infer<typeof chatRoleSchema>
export type ChatMessageKind = z.infer<typeof chatMessageKindSchema>
export type ChatMessagePayload = z.infer<typeof chatMessagePayloadSchema>
export type FileChange = z.infer<typeof fileChangeSchema>
export type CreateChatMessageDataType = z.infer<typeof createChatMessageSchema>
export type ListChatMessagesQuery = z.infer<typeof listChatMessagesQuerySchema>

export type CreateTeamMessageDataType = z.infer<typeof createTeamMessageSchema>
export type ListTeamMessagesQuery = z.infer<typeof listTeamMessagesQuerySchema>
export type MarkTeamChatReadDataType = z.infer<typeof markTeamChatReadSchema>

export type SecretScope = z.infer<typeof secretScopeSchema>
export type UpsertProjectSecretDataType = z.infer<
  typeof upsertProjectSecretSchema
>

export type RecordProjectCommitDataType = z.input<
  typeof recordProjectCommitSchema
>

export type ProjectInfoData = z.infer<typeof projectInfoSchema>
export type UpdateProjectInfoDataType = z.input<typeof updateProjectInfoSchema>

export type ChatMessage = {
  id: string
  projectId: string
  role: ChatRole
  kind: ChatMessageKind
  content: string
  payload: ChatMessagePayload | null
  /** The sender of a USER message; null for the agent, the system, or a deleted account. */
  author: { id: string; name: string; image: string | null } | null
  /** The agent run it belongs to (I2); null for plain chat. */
  runId: string | null
  createdAt: Date
}

/** One message in the Team chat: collaborators talking to each other, not to the agent. */
export type TeamMessage = {
  id: string
  projectId: string
  /** 1, 2, 3… per project with no gaps: the order, paging cursor and read marker. */
  seq: number
  /** Null once the author's account is gone. */
  author: { id: string; name: string; image: string | null } | null
  content: string
  /** User ids tagged with "@". */
  mentions: string[]
  createdAt: Date
}

/** Somebody who can open a project: the workspace owner or a collaborator. */
export type ProjectMember = {
  id: string
  name: string
  email: string
  image: string | null
  role: "OWNER" | "EDITOR" | "VIEWER"
}

/** A page of the Team chat, plus where the asking user has read up to. */
export type TeamChatPage = {
  messages: TeamMessage[]
  hasMore: boolean
  lastReadSeq: number
  /** Messages from other people after `lastReadSeq`. */
  unread: number
}

export type ProjectSecretSummary = {
  id: string
  key: string
  scope: SecretScope
  updatedAt: Date
}

export type ProjectCommit = {
  id: string
  projectId: string
  hash: string
  author: string
  prompt: string
  filesChanged: number
  additions: number
  deletions: number
  isHead: boolean
  /** FORGEAI = made here and pushed, GITHUB = brought in, LEGACY = pre-GitHub tar archive (hash is a content hash). */
  source: CommitSource
  /** The GitHub account that authored it, when known. */
  authorLogin: string | null
  /** Per-file changes, for commits made through git. */
  files: CommitFileStat[] | null
  createdAt: Date
}

export type CommitSource = "FORGEAI" | "GITHUB" | "LEGACY"

export type ProjectRepo = {
  id: string
  owner: string
  name: string
  branch: string
  /** Created by ForgeAI and pushed to on every commit; imported repos are not. */
  managed: boolean
  connectionId: string | null
}

export type ProjectDetail = {
  project: Project & { repo: ProjectRepo | null }
  info: ProjectInfoData
}

export type ProjectPatch = Partial<
  Pick<
    Project,
    "name" | "description" | "status" | "mode" | "stack" | "starred"
  >
>

export type CommitProjectDataType = z.infer<typeof commitProjectSchema>

/** Durable project events published on Redis and forwarded to browsers by ws-server. */
export type ProjectEvent =
  | { type: "project.updated"; projectId: string; project: ProjectPatch }
  | { type: "message.created"; projectId: string; message: ChatMessage }
  /** A Team chat post, decrypted (only travels between our services and members). */
  | {
      type: "team.message.created"
      projectId: string
      teamMessage: TeamMessage
    }
  | { type: "secret.upserted"; projectId: string; secret: ProjectSecretSummary }
  | { type: "secret.deleted"; projectId: string; secretId: string }
  | { type: "commit.created"; projectId: string; commit: ProjectCommit }
  /** A commit changed after it was announced (e.g. the Initial Commit once pushed). */
  | {
      type: "commit.updated"
      projectId: string
      commit: ProjectCommit
      repo: ProjectRepo | null
    }
  /** GitHub has commits this project hasn't taken in; commits are blocked until resolved. */
  | { type: "github.shift"; projectId: string; githubHead: string }
  /** Somebody resolved the shift; `replaced` files can be restored from `backup`. */
  | {
      type: "github.resolved"
      projectId: string
      byName: string
      choice: "theirs" | "merge" | "mine"
      commits: ProjectCommit[]
      repo: ProjectRepo
      replaced: string[]
      backup: string
    }
  | { type: "commit.head"; projectId: string; commitId: string }
  | { type: "info.updated"; projectId: string; info: ProjectInfoData }
  /** The dev command changed; carries the full settings so an open Start dialog can update. */
  | {
      type: "devCommand.updated"
      projectId: string
      settings: DevCommandSettings
    }
  /** Access changed for `userId` (or everyone when null). ws-server-only: it drops the affected sockets. */
  | { type: "access.changed"; projectId: string; userId: string | null }
