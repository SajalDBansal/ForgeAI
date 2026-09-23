"use client"

import { create } from "zustand"

import {
  findBaseWorkspaceId,
  type CreateProjectDataType,
  type Project,
  type ProjectMode,
  type ProjectSource,
  type AccountCollaborator,
  type TemplateListItem,
  type Workspace,
} from "@/lib/types"
import { projectNameFromPrompt } from "@/lib/builder-data"

export interface CreateProjectInput {
  prompt: string
  mode: ProjectMode
  source: ProjectSource
  repo?: CreateProjectDataType["repo"] | null
  workspaceId?: string
  name?: string
  templateId?: string
}

// Returns a new list where the item with `id` is replaced by `update(item)`.
// Keeps the store's per-item updates short and immutable.
function updateById<T extends { id: string }>(
  items: T[],
  id: string,
  update: (item: T) => T,
): T[] {
  return items.map((item) => (item.id === id ? update(item) : item))
}

// Makes a temporary client-side id with the given prefix.
// Used for optimistic rows until the server's id replaces them.
function localId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

interface AppState {
  projects: Project[]
  workspaces: Workspace[]
  /** Everyone sharing a workspace with this account; account-wide, so held here once. */
  collaborators: AccountCollaborator[]
  templates: TemplateListItem[]
  metadataStatus: "idle" | "loading" | "loaded"

  startMetadataLoad: () => void
  setAppMetadata: (data: {
    workspaces: Workspace[]
    projects: Project[]
    collaborators: AccountCollaborator[]
  }) => void
  clearAppMetadata: () => void
  /** Replaces the list after an invite or removal. */
  setCollaborators: (collaborators: AccountCollaborator[]) => void

  setTemplates: (templates: TemplateListItem[]) => void

  createProject: (input: CreateProjectInput) => Project
  addProject: (project: Project) => void
  replaceProject: (id: string, project: Project) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  touchProject: (id: string) => void
  archiveProject: (id: string) => void
  restoreProject: (id: string) => void
  deleteProject: (id: string) => Project | null

  createWorkspace: (name: string) => Workspace
  addWorkspace: (workspace: Workspace) => void
  updateWorkspace: (id: string, patch: Partial<Workspace>) => void
  replaceWorkspace: (id: string, workspace: Workspace) => void
  archiveWorkspace: (id: string) => void
  restoreWorkspace: (id: string) => void
  deleteWorkspace: (id: string) => DeletedWorkspace | null
}

/** A deleted workspace and its projects: enough to put them back on undo. */
export interface DeletedWorkspace {
  workspace: Workspace
  projects: Project[]
}

// Global client store for workspaces, projects, collaborators and templates.
// Actions are optimistic; callers reconcile with the server's reply.
export const useAppStore = create<AppState>()((set, get) => ({
  projects: [],
  workspaces: [],
  collaborators: [],
  templates: [],
  metadataStatus: "idle",

  startMetadataLoad: () => set({ metadataStatus: "loading" }),

  setAppMetadata: ({ workspaces, projects, collaborators }) =>
    set({ workspaces, projects, collaborators, metadataStatus: "loaded" }),

  clearAppMetadata: () =>
    set({
      workspaces: [],
      projects: [],
      collaborators: [],
      templates: [],
      metadataStatus: "idle",
    }),

  setCollaborators: (collaborators) => set({ collaborators }),

  setTemplates: (templates) => set({ templates }),

  createProject: (input) => {
    const trimmedPrompt = input.prompt.trim()
    const now = new Date().toISOString()
    const fallbackWorkspaceId = findBaseWorkspaceId(get().workspaces) ?? ""
    const project: Project = {
      id: localId("p"),
      name: input.name?.trim() || projectNameFromPrompt(trimmedPrompt),
      // Filled in by the server row that replaces this placeholder.
      createdById: null,
      description: null,
      initialPrompt: trimmedPrompt,
      status: input.mode === "PLAN" ? "PLANNING" : "BUILDING",
      starred: false,
      stack: [],
      mode: input.mode,
      source: input.source,
      // Placeholder until the API replies with the verified repo (and its default branch).
      repo:
        input.source === "GITHUB" && input.repo
          ? { ...input.repo, branch: input.repo.branch ?? "" }
          : null,
      workspaceId: input.workspaceId ?? fallbackWorkspaceId,
      createdAt: now,
      updatedAt: now,
      lastUsed: now,
      archivedAt: null,
    }
    set((state) => ({ projects: [project, ...state.projects] }))
    return project
  },

  addProject: (project) =>
    set((state) => ({ projects: [project, ...state.projects] })),

  replaceProject: (id, project) =>
    set((state) => ({
      projects: updateById(state.projects, id, () => project),
    })),

  updateProject: (id, patch) =>
    set((state) => ({
      projects: updateById(state.projects, id, (p) => ({ ...p, ...patch })),
    })),

  touchProject: (id) =>
    set((state) => ({
      projects: updateById(state.projects, id, (p) => ({
        ...p,
        lastUsed: new Date().toISOString(),
      })),
    })),

  archiveProject: (id) =>
    set((state) => ({
      projects: updateById(state.projects, id, (p) => ({
        ...p,
        archivedAt: new Date().toISOString(),
      })),
    })),

  restoreProject: (id) =>
    set((state) => ({
      projects: updateById(state.projects, id, (p) => ({
        ...p,
        archivedAt: null,
      })),
    })),

  deleteProject: (id) => {
    const project = get().projects.find((p) => p.id === id) ?? null
    if (project)
      set((state) => ({ projects: state.projects.filter((p) => p.id !== id) }))
    return project
  },

  createWorkspace: (name) => {
    const workspace: Workspace = {
      id: localId("ws"),
      name: name.trim(),
      description: null,
      deleteable: true,
      archivedAt: null,
    }
    set((state) => ({ workspaces: [...state.workspaces, workspace] }))
    return workspace
  },

  addWorkspace: (workspace) =>
    set((state) => ({ workspaces: [...state.workspaces, workspace] })),

  updateWorkspace: (id, patch) =>
    set((state) => ({
      workspaces: updateById(state.workspaces, id, (w) => ({ ...w, ...patch })),
    })),

  replaceWorkspace: (id, workspace) =>
    set((state) => ({
      workspaces: updateById(state.workspaces, id, () => workspace),
      projects: state.projects.map((p) =>
        p.workspaceId === id ? { ...p, workspaceId: workspace.id } : p,
      ),
    })),

  archiveWorkspace: (id) =>
    set((state) => ({
      workspaces: updateById(state.workspaces, id, (w) => ({
        ...w,
        archivedAt: new Date().toISOString(),
      })),
    })),

  restoreWorkspace: (id) =>
    set((state) => ({
      workspaces: updateById(state.workspaces, id, (w) => ({
        ...w,
        archivedAt: null,
      })),
    })),

  deleteWorkspace: (id) => {
    const workspace = get().workspaces.find((w) => w.id === id)
    if (!workspace) return null

    // The API cascades the delete to the workspace's projects, so the store has to as well.
    const projects = get().projects.filter((p) => p.workspaceId === id)
    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== id),
      projects: state.projects.filter((p) => p.workspaceId !== id),
    }))
    return { workspace, projects }
  },
}))

// Subscribes to one project from the store by id.
// Re-renders only when that project changes.
export function useProject(id: string): Project | undefined {
  return useAppStore((s) => s.projects.find((p) => p.id === id))
}

export type { Project, Workspace, TemplateListItem }
