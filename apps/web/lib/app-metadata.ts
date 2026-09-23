import { useAppStore } from "@/lib/store"
import type { AccountCollaborator, Project, Workspace } from "@/lib/types"
import type { ProjectMode, ProjectSource, ProjectStatus } from "@forgeAI/shared"
import { PUBLIC_ENV } from "@/lib/env"

export interface RawWorkspace {
  id: string
  name: string
  /** The owner; compared with the signed-in user to gate owner-only actions. */
  userId: string
  deleteable: boolean
  archivedAt: string | null
}

export interface RawProject {
  id: string
  name: string
  description: string | null
  initialPrompt: string
  status: ProjectStatus
  starred: boolean
  stack: string[]
  mode: ProjectMode
  source: ProjectSource
  workspaceId: string
  lastUsed: string
  archivedAt: string | null
  createdById: string | null
  createdBy: { name: string } | null
}

export interface RawAppMetadata {
  workspaces: RawWorkspace[]
  projects: RawProject[]
  /** Everyone sharing a workspace with this account (already the client shape). */
  collaborators: AccountCollaborator[]
}

// Maps one workspace from the metadata payload to the client shape.
// Metadata rows don't carry a description, so it's always null here.
function toWorkspace(w: RawWorkspace): Workspace {
  return {
    id: w.id,
    name: w.name,
    userId: w.userId,
    description: null,
    deleteable: w.deleteable,
    archivedAt: w.archivedAt ?? null,
  }
}

// Maps one project from the metadata payload to the client shape.
// Flattens the creator's name for the project lists.
function toProject(p: RawProject): Project {
  return {
    id: p.id,
    name: p.name,
    createdById: p.createdById ?? null,
    createdByName: p.createdBy?.name ?? null,
    description: p.description ?? null,
    initialPrompt: p.initialPrompt,
    status: p.status,
    starred: p.starred,
    stack: p.stack ?? [],
    mode: p.mode,
    source: p.source,
    workspaceId: p.workspaceId,
    lastUsed: p.lastUsed,
    archivedAt: p.archivedAt ?? null,
  }
}

// Maps the whole metadata payload, tolerating missing lists.
// Used by the provider's first load and by refreshAppMetadata.
export function mapAppMetadata(raw: RawAppMetadata): {
  workspaces: Workspace[]
  projects: Project[]
  collaborators: AccountCollaborator[]
} {
  const workspaces: Workspace[] = Array.isArray(raw?.workspaces)
    ? raw.workspaces.map(toWorkspace)
    : []
  const projects: Project[] = Array.isArray(raw?.projects)
    ? raw.projects.map(toProject)
    : []

  return {
    workspaces,
    projects,
    collaborators: Array.isArray(raw?.collaborators) ? raw.collaborators : [],
  }
}

const AUTH_URL = PUBLIC_ENV.AUTH_URL

// Re-reads workspaces, projects and collaborators into the store without a loading state.
// Used after accepting an invite, so the newly joined workspace appears immediately.
export async function refreshAppMetadata(): Promise<void> {
  try {
    const res = await fetch(`${AUTH_URL}/api/v1/metadata/user`, {
      credentials: "include",
    })
    if (!res.ok) return
    useAppStore
      .getState()
      .setAppMetadata(mapAppMetadata((await res.json()) as RawAppMetadata))
  } catch {
    // Leave what is in the store; the next sign-in corrects it.
  }
}
