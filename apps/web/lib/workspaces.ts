import { apiRequest, type ApiInit, type ApiResult } from "@/lib/api-client"
import type { Workspace } from "@/lib/types"

interface RawWorkspaceRow {
  id: string
  name: string
  description: string | null
  deleteable: boolean
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

// Maps the API's workspace JSON to the client Workspace shape.
// Normalises missing nullable fields to null.
function mapWorkspace(raw: RawWorkspaceRow): Workspace {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? null,
    deleteable: raw.deleteable,
    archivedAt: raw.archivedAt ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

// Sends a workspace request and maps the returned row.
// Shared by the create/archive/restore helpers.
async function workspaceRequest(
  path: string,
  init: ApiInit,
): Promise<ApiResult<Workspace>> {
  const result = await apiRequest<RawWorkspaceRow>(path, init)
  return result.ok ? { ok: true, data: mapWorkspace(result.data) } : result
}

// Creates a workspace with the given name.
// Used by the "New workspace" dialog; the key keeps a double click from creating two.
export function createWorkspaceRequest(
  name: string,
  idempotencyKey?: string,
): Promise<ApiResult<Workspace>> {
  return workspaceRequest("/workspace", {
    method: "POST",
    body: JSON.stringify({ name }),
    idempotencyKey,
    fallbackError: "Couldn't create that workspace.",
  })
}

// Archives a workspace.
// Owner only.
export function archiveWorkspaceRequest(
  id: string,
): Promise<ApiResult<Workspace>> {
  return workspaceRequest(`/workspace/${id}/archive`, {
    method: "POST",
    fallbackError: "Couldn't archive that workspace.",
  })
}

// Restores an archived workspace.
// Owner only.
export function restoreWorkspaceRequest(
  id: string,
): Promise<ApiResult<Workspace>> {
  return workspaceRequest(`/workspace/${id}/restore`, {
    method: "POST",
    fallbackError: "Couldn't restore that workspace.",
  })
}

// Permanently deletes a workspace.
// Owner only.
export function deleteWorkspaceRequest(id: string): Promise<ApiResult<void>> {
  return apiRequest<void>(`/workspace/${id}`, {
    method: "DELETE",
    fallbackError: "Couldn't delete that workspace.",
  })
}
