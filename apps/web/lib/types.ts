import type {
  AccountCollaborator as DbAccountCollaborator,
  Project as DbProject,
  Template as DbTemplate,
  TemplateInfo as DbTemplateInfo,
  Workspace as DbWorkspace,
  WorkspaceCollaborator as DbWorkspaceCollaborator,
  ConnectionProvider,
  ConnectionStatus,
  ProjectMode,
  ProjectStatus,
} from "@forgeAI/shared"

export type {
  CollaboratorRole,
  ConnectionProvider,
  ConnectionStatus,
  CreateProjectDataType,
  CreateTemplateDataType,
  InvitationStatus,
  ProjectMode,
  ProjectSource,
  ProjectStatus,
  TemplateMetadata,
  UpdateProjectDataType,
  UpdateWorkspaceDataType,
} from "@forgeAI/shared"

type Serialized<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K]
}

export interface RepoRef {
  id?: string
  owner: string
  name: string
  branch: string
  connectionId?: string | null
}

export type Project = Omit<
  Serialized<DbProject>,
  "createdAt" | "updatedAt" | "initialPrompt" | "repoId"
> & {
  createdAt?: string
  updatedAt?: string
  initialPrompt?: string
  repoId?: string | null
  repo?: RepoRef | null
}

export type Workspace = Omit<Serialized<DbWorkspace>, "createdAt" | "updatedAt" | "userId"> & {
  createdAt?: string
  updatedAt?: string
  userId?: string
}

export type Template = Serialized<DbTemplate>

export type TemplateDetail = Serialized<DbTemplateInfo>

export type TemplateListItem = Pick<
  Template,
  "id" | "name" | "tag" | "description" | "storageRef" | "previewImageUrl" | "workspaceId"
>

export type WorkspaceCollaborator = Serialized<DbWorkspaceCollaborator>

export type AccountCollaborator = Serialized<DbAccountCollaborator>

export function collaboratorInitials(name: string, email: string): string {
  const source = name.trim() || email.trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

export interface Connection {
  id?: string
  provider: ConnectionProvider
  status: ConnectionStatus
  externalAccountLogin: string
  externalAccountId?: string
  scopes?: string[]
  expiresAt?: string | null
  updatedAt: string
}

export type MessageRole = "user" | "agent" | "system"
export type MessageKind =
  | "text"
  | "task"
  | "question"
  | "permission"
  | "files"
  | "warning"
  | "success"
  | "repo-push"
  | "pr-prompt"

export interface TaskItem {
  label: string
  status: "done" | "active" | "pending"
}

export interface FileChange {
  path: string
  action: "created" | "updated" | "deleted"
  additions?: number
  deletions?: number
}

export interface Message {
  id: string
  role: MessageRole
  kind: MessageKind
  text?: string
  timestamp: string
  tasks?: TaskItem[]
  options?: string[]
  files?: FileChange[]
  permissionTitle?: string
  permissionDetail?: string
  repoPath?: string
  commitHash?: string
  fileCount?: number
  initial?: boolean
  prBranch?: string
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  BUILDING: "Building",
  READY: "Ready",
  PLANNING: "Planning",
  NEEDS_INPUT: "Needs input",
}

export const PROJECT_MODE_LABEL: Record<ProjectMode, string> = {
  BUILD: "Build",
  PLAN: "Plan",
}

export function findBaseWorkspaceId(workspaces: Workspace[]): string | null {
  return workspaces.find((w) => w.deleteable === false)?.id ?? workspaces[0]?.id ?? null
}

export function resolveWorkspaceName(workspace: Workspace, firstName?: string): string {
  if (workspace.deleteable === false && firstName) return `${firstName}'s projects`
  return workspace.name
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "—"
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return "—"
  const min = Math.floor(ms / 60000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day === 1) return "yesterday"
  if (day < 7) return `${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}w ago`
  return `${Math.floor(day / 30)}mo ago`
}
