import type {
  ChatMessageKind,
  ChatMessagePayload,
  ChatRole,
  ProjectEvent,
  ProjectInfoData,
  ProjectPatch,
  SecretScope,
  UpsertProjectSecretDataType,
} from "@forgeAI/shared"

import { apiRequest, type ApiResult } from "@/lib/api-client"
import { mapProject, type RawProjectRow } from "@/lib/projects"
import type {
  DevCommandSettings,
  Message,
  MessageKind,
  MessageRole,
  Project,
  RepoRef,
} from "@/lib/types"

// ---------- CLIENT SHAPES ----------

export type { ProjectInfoData }

export interface SecretSummary {
  id: string
  key: string
  scope: SecretScope
  updatedAt: string
}

export interface Commit {
  id: string
  hash: string
  author: string
  prompt: string
  filesChanged: number
  additions: number
  deletions: number
  isHead: boolean
  /** FORGEAI = made here and pushed; GITHUB = made on GitHub; LEGACY = saved before GitHub. */
  source: "FORGEAI" | "GITHUB" | "LEGACY"
  /** The GitHub account that authored it. */
  authorLogin: string | null
  /** Per-file changes, for commits made through git. */
  files: { path: string; additions: number; deletions: number }[] | null
  createdAt: string
}

// Checks whether a commit is a real git commit (on GitHub, rollback-able).
// Legacy pre-GitHub versions are not.
export function isGitCommit(commit: Commit): boolean {
  return commit.source !== "LEGACY"
}

// Returns the 7-character hash GitHub shows (legacy hashes are shown whole).
// Used in History rows and dialogs.
export function shortHash(commit: Commit): string {
  return isGitCommit(commit) ? commit.hash.slice(0, 7) : commit.hash
}

/** One message in the Team chat — collaborators talking to each other, not to the agent. */
export interface TeamChatMessage {
  id: string
  projectId: string
  /** 1, 2, 3… per project with no gaps: order, paging cursor and read marker. */
  seq: number
  author: { id: string; name: string; image: string | null } | null
  content: string
  /** User ids tagged with "@". */
  mentions: string[]
  createdAt: string
}

/** Somebody who can open the project — its workspace's owner or a collaborator. */
export interface ProjectMember {
  id: string
  name: string
  email: string
  image: string | null
  role: "OWNER" | "EDITOR" | "VIEWER"
}

export interface TeamChatPage {
  messages: TeamChatMessage[]
  hasMore: boolean
  lastReadSeq: number
  unread: number
}

/** A ProjectEvent mapped to client shapes: what the project store applies. */
export type BuildEvent =
  | { type: "project.updated"; projectId: string; project: ProjectPatch }
  | { type: "message.created"; projectId: string; message: Message }
  /** Not held in the project store: `useTeamChat` listens for it directly. */
  | {
      type: "team.message.created"
      projectId: string
      teamMessage: TeamChatMessage
    }
  | { type: "secret.upserted"; projectId: string; secret: SecretSummary }
  | { type: "secret.deleted"; projectId: string; secretId: string }
  | { type: "commit.created"; projectId: string; commit: Commit }
  | { type: "commit.head"; projectId: string; commitId: string }
  /** A commit changed after it was announced (e.g. the Initial Commit once pushed). */
  | {
      type: "commit.updated"
      projectId: string
      commit: Commit
      repo: RepoRef | null
    }
  /** GitHub has commits the project hasn't taken in: the shift popup's cue. */
  | { type: "github.shift"; projectId: string; githubHead: string }
  /** Somebody resolved the shift: new History rows, and files anyone may want back. */
  | {
      type: "github.resolved"
      projectId: string
      byName: string
      choice: ShiftChoice
      commits: Commit[]
      repo: RepoRef
      replaced: string[]
      backup: string
    }
  | { type: "info.updated"; projectId: string; info: ProjectInfoData }
  /** The dev command changed; only the open Start dialog listens for this. */
  | {
      type: "devCommand.updated"
      projectId: string
      settings: DevCommandSettings
    }

// ---------- WIRE SHAPES (JSON — dates arrive as strings) ----------

export interface RawChatMessage {
  id: string
  projectId: string
  role: ChatRole
  kind: ChatMessageKind
  content: string
  payload: ChatMessagePayload | null
  author: { id: string; name: string; image: string | null } | null
  runId: string | null
  createdAt: string
}

type Wire<E> = E extends ProjectEvent
  ? E extends { message: unknown }
    ? Omit<E, "message"> & { message: RawChatMessage }
    : E extends { secret: unknown }
      ? Omit<E, "secret"> & { secret: SecretSummary }
      : E extends { commit: unknown }
        ? Omit<E, "commit"> & { commit: Commit }
        : E extends { commits: unknown }
          ? Omit<E, "commits"> & { commits: Commit[] }
          : E extends { teamMessage: unknown }
            ? Omit<E, "teamMessage"> & { teamMessage: TeamChatMessage }
            : E
  : never

/** A ProjectEvent as it arrives over the wire (`access.changed` never reaches the browser). */
export type RawProjectEvent = Wire<
  Exclude<ProjectEvent, { type: "access.changed" }>
>

// ---------- MAPPERS ----------

const MESSAGE_KIND: Record<ChatMessageKind, MessageKind> = {
  TEXT: "text",
  TASK: "task",
  QUESTION: "question",
  PERMISSION: "permission",
  FILES: "files",
  WARNING: "warning",
  SUCCESS: "success",
  REPO_PUSH: "repo-push",
  PR_PROMPT: "pr-prompt",
}

// Maps a wire chat message to the client Message, spreading its kind-specific payload.
// Used for history pages, sends and live events.
export function mapChatMessage(raw: RawChatMessage): Message {
  return {
    ...(raw.payload ?? {}),
    id: raw.id,
    role: raw.role.toLowerCase() as MessageRole,
    kind: MESSAGE_KIND[raw.kind],
    text: raw.content,
    timestamp: raw.createdAt,
    author: raw.author ? { id: raw.author.id, name: raw.author.name } : null,
    runId: raw.runId,
  }
}

// Maps a wire project event to a BuildEvent the store can apply.
// Only chat messages need converting; everything else is already client-shaped.
export function mapProjectEvent(raw: RawProjectEvent): BuildEvent {
  if (raw.type === "message.created")
    return { ...raw, message: mapChatMessage(raw.message) }
  return raw
}

// ---------- REQUESTS ----------

export interface ProjectDetail {
  project: Project
  info: ProjectInfoData
}

// Requests a short-lived ticket for the project's live WebSocket.
// Fetched right before every (re)connect.
export function getWsTicketRequest(
  projectId: string,
): Promise<ApiResult<{ ticket: string }>> {
  return apiRequest(`/project/${projectId}/ws-ticket`, {
    method: "POST",
    fallbackError: "Couldn't open a live connection to this project.",
  })
}

// Loads the project and its Info document.
// First request when the builder opens.
export async function getProjectDetailRequest(
  projectId: string,
): Promise<ApiResult<ProjectDetail>> {
  const result = await apiRequest<{
    project: RawProjectRow
    info: ProjectInfoData
  }>(`/project/${projectId}`, {
    fallbackError: "Couldn't load this project.",
  })
  return result.ok
    ? {
        ok: true,
        data: {
          project: mapProject(result.data.project),
          info: result.data.info,
        },
      }
    : result
}

// Loads a page of the agent chat, older than `before` when given.
// Used for the first load and "load older".
export async function listMessagesRequest(
  projectId: string,
  before?: string,
): Promise<ApiResult<{ messages: Message[]; hasMore: boolean }>> {
  const query = before ? `?before=${encodeURIComponent(before)}` : ""
  const result = await apiRequest<{
    messages: RawChatMessage[]
    hasMore: boolean
  }>(`/project/${projectId}/messages${query}`, {
    fallbackError: "Couldn't load the conversation.",
  })
  return result.ok
    ? {
        ok: true,
        data: {
          messages: result.data.messages.map(mapChatMessage),
          hasMore: result.data.hasMore,
        },
      }
    : result
}

// Sends a message to the agent chat.
// The reply is the saved message; other tabs get it over the socket.
export async function sendMessageRequest(
  projectId: string,
  content: string,
): Promise<ApiResult<Message>> {
  // To the agent (I5): saved like any chat message, and a run is queued for it.
  const result = await apiRequest<RawChatMessage>(
    `/project/${projectId}/agent`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
      fallbackError: "Couldn't send that message.",
    },
  )
  return result.ok ? { ok: true, data: mapChatMessage(result.data) } : result
}

// Restores the files touched by one completed agent run back to its checkpoint.
export function undoAgentRunRequest(
  projectId: string,
  runId: string,
): Promise<ApiResult<{ files: number }>> {
  return apiRequest(
    `/project/${encodeURIComponent(projectId)}/agent-runs/${encodeURIComponent(runId)}/undo`,
    {
      method: "POST",
      fallbackError: "Couldn't undo that agent run.",
    },
  )
}

// Stops queued, running or waiting agent work.
export function cancelAgentRunRequest(
  projectId: string,
  runId: string,
): Promise<ApiResult<{ status: "cancelled" | "already_finished" }>> {
  return apiRequest(
    `/project/${encodeURIComponent(projectId)}/agent-runs/${encodeURIComponent(runId)}/cancel`,
    {
      method: "POST",
      fallbackError: "Couldn't stop that agent run.",
    },
  )
}

// ---------- TEAM CHAT ----------

// Loads a Team chat page: the newest without `before`, else the one before that seq.
// Used for the first load and scrolling back.
export function listTeamMessagesRequest(
  projectId: string,
  before?: number,
): Promise<ApiResult<TeamChatPage>> {
  const query = before ? `?before=${before}` : ""
  return apiRequest(`/project/${projectId}/team-messages${query}`, {
    fallbackError: "Couldn't load the team chat.",
  })
}

// Lists everyone who can open the project.
// Used for presence and @-mentions.
export function listProjectMembersRequest(
  projectId: string,
): Promise<ApiResult<ProjectMember[]>> {
  return apiRequest(`/project/${projectId}/members`, {
    fallbackError: "Couldn't load who is on this project.",
  })
}

// Posts a Team chat message with its @-mentions.
// Other tabs get it as `team.message.created`.
export function sendTeamMessageRequest(
  projectId: string,
  content: string,
  mentions: string[],
): Promise<ApiResult<TeamChatMessage>> {
  return apiRequest(`/project/${projectId}/team-messages`, {
    method: "POST",
    body: JSON.stringify({ content, mentions }),
    fallbackError: "Couldn't send that message.",
  })
}

// Moves the user's Team chat read marker forward.
// Clears the unread badge.
export function markTeamChatReadRequest(
  projectId: string,
  seq: number,
): Promise<ApiResult<void>> {
  return apiRequest(`/project/${projectId}/team-messages/read`, {
    method: "PUT",
    body: JSON.stringify({ seq }),
    fallbackError: "Couldn't save where you read up to.",
  })
}

// Lists the project's secret keys (never values).
// Backs the Cloud tab.
export function listSecretsRequest(
  projectId: string,
): Promise<ApiResult<SecretSummary[]>> {
  return apiRequest(`/project/${projectId}/secrets`, {
    fallbackError: "Couldn't load secrets.",
  })
}

// Creates or updates a project secret.
// Editors and the owner only.
export function upsertSecretRequest(
  projectId: string,
  input: Omit<UpsertProjectSecretDataType, "scope"> & { scope?: SecretScope },
): Promise<ApiResult<SecretSummary>> {
  return apiRequest(`/project/${projectId}/secrets`, {
    method: "PUT",
    body: JSON.stringify(input),
    fallbackError: "Couldn't save that secret.",
  })
}

// Fetches one secret's decrypted value.
// Backs the reveal button in the Cloud tab.
export async function revealSecretRequest(
  projectId: string,
  secretId: string,
): Promise<ApiResult<string>> {
  const result = await apiRequest<{ value: string }>(
    `/project/${projectId}/secrets/${secretId}/value`,
    {
      fallbackError: "Couldn't reveal that secret.",
    },
  )
  return result.ok ? { ok: true, data: result.data.value } : result
}

// Deletes a project secret.
// Editors and the owner only.
export function deleteSecretRequest(
  projectId: string,
  secretId: string,
): Promise<ApiResult<void>> {
  return apiRequest(`/project/${projectId}/secrets/${secretId}`, {
    method: "DELETE",
    fallbackError: "Couldn't remove that secret.",
  })
}

// Loads the project's History.
// Newest commit first.
export function listCommitsRequest(
  projectId: string,
): Promise<ApiResult<Commit[]>> {
  return apiRequest(`/project/${projectId}/commits`, {
    fallbackError: "Couldn't load history.",
  })
}

// Commits the project to GitHub and adds it to History.
// Other tabs receive it as `commit.created` over the socket; the key keeps a retry from committing twice.
export async function commitProjectRequest(
  projectId: string,
  message: string,
  idempotencyKey?: string,
): Promise<ApiResult<RecordedCommit>> {
  return apiRequest<RecordedCommit>(
    `/project/${encodeURIComponent(projectId)}/commits`,
    {
      method: "POST",
      body: JSON.stringify({ message }),
      idempotencyKey,
      fallbackError: "Couldn't save this commit.",
    },
  )
}

// ---------- WHEN GITHUB MOVED ----------

export type ShiftChoice = "theirs" | "merge" | "mine"

export interface ShiftDetails {
  kind: "ahead" | "rewritten"
  githubHead: string
  commits: {
    sha: string
    authorName: string
    authorEmail: string
    date: string
    message: string
    files: { path: string; additions: number; deletions: number }[]
  }[]
  files: { path: string; additions: number; deletions: number }[]
  /** Uncommitted here. */
  localChanges: string[]
  /** Changed on GitHub *and* uncommitted here; `conflict` when a line-by-line merge can't settle it. */
  overlaps: { path: string; conflict: boolean }[]
}

export type GithubStatus =
  | { state: "none" }
  | { state: "disconnected"; repo: RepoRef }
  | { state: "same"; repo: RepoRef }
  | {
      state: "shift"
      repo: RepoRef
      githubHead: string
      details: ShiftDetails | null
    }
  | { state: "unknown"; repo: RepoRef; message: string }

// Asks whether GitHub is where ForgeAI left it; `fresh` skips the one-minute cache.
// Called on open, on focus and when the GitHub dialog opens.
export function githubStatusRequest(
  projectId: string,
  fresh = false,
): Promise<ApiResult<GithubStatus>> {
  return apiRequest(
    `/project/${encodeURIComponent(projectId)}/github/status${fresh ? "?fresh=1" : ""}`,
    {
      fallbackError: "Couldn't check GitHub.",
    },
  )
}

// Resolves a GitHub shift with the chosen strategy and per-file picks.
// Fails with "moved" if GitHub changed again meanwhile.
export function resolveShiftRequest(
  projectId: string,
  body: {
    choice: ShiftChoice
    expectHead: string
    picks: { path: string; keep: "mine" | "theirs" }[]
  },
): Promise<ApiResult<{ replaced: string[]; backup: string }>> {
  return apiRequest(
    `/project/${encodeURIComponent(projectId)}/github/resolve`,
    {
      method: "POST",
      body: JSON.stringify(body),
      fallbackError: "Couldn't bring in GitHub's changes.",
    },
  )
}

// Restores one file from a shift's backup.
// Backs "Restore my version".
export function restoreShiftFileRequest(
  projectId: string,
  backup: string,
  path: string,
): Promise<ApiResult<void>> {
  return apiRequest(
    `/project/${encodeURIComponent(projectId)}/github/restore-file`,
    {
      method: "POST",
      body: JSON.stringify({ backup, path }),
      fallbackError: "Couldn't restore that file.",
    },
  )
}

/** A commit as the server returns it. */
export type RecordedCommit = Commit

// Rolls the project back to a commit, recorded as a new commit.
// Owner only; the key keeps a retry from rolling back twice.
export function rollbackCommitRequest(
  projectId: string,
  commitId: string,
  idempotencyKey?: string,
): Promise<ApiResult<RecordedCommit>> {
  return apiRequest<RecordedCommit>(
    `/project/${encodeURIComponent(projectId)}/commits/${encodeURIComponent(commitId)}/rollback`,
    {
      method: "POST",
      idempotencyKey,
      fallbackError: "Couldn't roll back to that commit.",
    },
  )
}

// Creates the project's GitHub repo and commits its current files.
// Owner only; the project must be open. The key keeps a retry from creating a second repository.
export function connectGithubRequest(
  projectId: string,
  idempotencyKey?: string,
): Promise<ApiResult<Commit>> {
  return apiRequest(
    `/project/${encodeURIComponent(projectId)}/github/connect`,
    {
      method: "POST",
      idempotencyKey,
      fallbackError: "Couldn't put this project on GitHub.",
    },
  )
}

// Builds the GitHub URL of one commit.
// Used for "View on GitHub" links.
export function githubCommitUrl(repo: RepoRef, sha: string): string {
  return `https://github.com/${repo.owner}/${repo.name}/commit/${sha}`
}

// Builds the GitHub URL of a repository.
// Used for repo links in the header and dialogs.
export function githubRepoUrl(repo: RepoRef): string {
  return `https://github.com/${repo.owner}/${repo.name}`
}
