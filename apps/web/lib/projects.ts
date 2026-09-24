import { apiRequest, type ApiInit, type ApiResult } from "@/lib/api-client"
import type { CreateProjectDataType, Project } from "@/lib/types"
import type { ProjectMode, ProjectSource, ProjectStatus } from "@forgeAI/shared"

export interface RawProjectRow {
  id: string
  name: string
  description: string | null
  initialPrompt: string
  status: ProjectStatus
  starred: boolean
  stack: string[]
  mode: ProjectMode
  source: ProjectSource
  repoId: string | null
  createdById: string | null
  workspaceId: string
  createdAt: string
  updatedAt: string
  lastUsed: string
  archivedAt: string | null
  repo?: {
    id: string
    owner: string
    name: string
    branch: string
    connectionId: string | null
  } | null
}

// Maps the API's project JSON to the client Project shape.
// Normalises missing nullable fields and keeps `repo` only when present.
export function mapProject(raw: RawProjectRow): Project {
  return {
    id: raw.id,
    name: raw.name,
    createdById: raw.createdById ?? null,
    description: raw.description ?? null,
    initialPrompt: raw.initialPrompt,
    status: raw.status,
    starred: raw.starred,
    stack: raw.stack ?? [],
    mode: raw.mode,
    source: raw.source,
    repoId: raw.repoId ?? null,
    workspaceId: raw.workspaceId,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    lastUsed: raw.lastUsed,
    archivedAt: raw.archivedAt ?? null,
    ...(raw.repo !== undefined && { repo: raw.repo }),
  }
}

// Sends a project request and maps the returned row.
// Shared by the create/archive/restore helpers.
async function projectRequest(
  path: string,
  init: ApiInit,
): Promise<ApiResult<Project>> {
  const result = await apiRequest<RawProjectRow>(path, init)
  return result.ok ? { ok: true, data: mapProject(result.data) } : result
}

// Creates a project from a prompt, template or repo.
// Used by the home composer and empty-project dialog; the key keeps a retry from creating two.
export function createProjectRequest(
  input: CreateProjectDataType,
  idempotencyKey?: string,
): Promise<ApiResult<Project>> {
  return projectRequest("/project", {
    method: "POST",
    body: JSON.stringify(input),
    idempotencyKey,
    fallbackError: "Couldn't create that project.",
  })
}

// Archives a project.
// Owner only.
export function archiveProjectRequest(id: string): Promise<ApiResult<Project>> {
  return projectRequest(`/project/${id}/archive`, {
    method: "POST",
    fallbackError: "Couldn't archive that project.",
  })
}

// Restores an archived project.
// Owner only.
export function restoreProjectRequest(id: string): Promise<ApiResult<Project>> {
  return projectRequest(`/project/${id}/restore`, {
    method: "POST",
    fallbackError: "Couldn't restore that project.",
  })
}

// Permanently deletes a project.
// Owner only.
export function deleteProjectRequest(id: string): Promise<ApiResult<void>> {
  return apiRequest<void>(`/project/${id}`, {
    method: "DELETE",
    fallbackError: "Couldn't delete that project.",
  })
}
