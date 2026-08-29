import type { Project, Workspace } from "@/lib/types"
import type { ProjectMode, ProjectSource, ProjectStatus } from "@forgeAI/shared"

export interface RawWorkspace {
  id: string
  name: string
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
}

export interface RawAppMetadata {
  workspaces: RawWorkspace[]
  projects: RawProject[]
}

export function mapAppMetadata(raw: RawAppMetadata): {
  workspaces: Workspace[]
  projects: Project[]
} {
  const workspaces: Workspace[] = Array.isArray(raw?.workspaces)
    ? raw.workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        description: null,
        deleteable: w.deleteable,
        archivedAt: w.archivedAt ?? null,
      }))
    : []

  const projects: Project[] = Array.isArray(raw?.projects)
    ? raw.projects.map((p) => ({
        id: p.id,
        name: p.name,
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
      }))
    : []

  return { workspaces, projects }
}
