"use client"

import { create } from "zustand"

import {
  findBaseWorkspaceId,
  type Project,
  type ProjectMode,
  type ProjectSource,
  type RepoRef,
  type TemplateListItem,
  type Workspace,
} from "@/lib/types"
import { projectNameFromPrompt } from "@/lib/builder-data"

export interface CreateProjectInput {
  prompt: string
  mode: ProjectMode
  source: ProjectSource
  repo?: RepoRef | null
  workspaceId?: string
}

interface AppState {
  projects: Project[]
  workspaces: Workspace[]
  templates: TemplateListItem[]
  metadataStatus: "idle" | "loading" | "loaded"

  startMetadataLoad: () => void
  setAppMetadata: (data: { workspaces: Workspace[]; projects: Project[] }) => void
  clearAppMetadata: () => void

  setTemplates: (templates: TemplateListItem[]) => void

  createProject: (input: CreateProjectInput) => Project
  updateProject: (id: string, patch: Partial<Project>) => void
  touchProject: (id: string) => void
  archiveProject: (id: string) => void
  restoreProject: (id: string) => void
  deleteProject: (id: string) => void

  createWorkspace: (name: string) => Workspace
  archiveWorkspace: (id: string) => void
  restoreWorkspace: (id: string) => void
  deleteWorkspace: (id: string) => void
}

export const useAppStore = create<AppState>()((set, get) => ({
  projects: [],
  workspaces: [],
  templates: [],
  metadataStatus: "idle",

  startMetadataLoad: () => set({ metadataStatus: "loading" }),

  setAppMetadata: ({ workspaces, projects }) =>
    set({ workspaces, projects, metadataStatus: "loaded" }),

  clearAppMetadata: () => set({ workspaces: [], projects: [], templates: [], metadataStatus: "idle" }),

  setTemplates: (templates) => set({ templates }),

  createProject: (input) => {
    const trimmedPrompt = input.prompt.trim()
    const now = new Date().toISOString()
    const fallbackWorkspaceId = findBaseWorkspaceId(get().workspaces) ?? ""
    const project: Project = {
      id: `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: projectNameFromPrompt(trimmedPrompt),
      description: null,
      initialPrompt: trimmedPrompt,
      status: input.mode === "PLAN" ? "PLANNING" : "BUILDING",
      starred: false,
      stack: [],
      mode: input.mode,
      source: input.source,
      repo: input.source === "GITHUB" ? (input.repo ?? null) : null,
      workspaceId: input.workspaceId ?? fallbackWorkspaceId,
      createdAt: now,
      updatedAt: now,
      lastUsed: now,
      archivedAt: null,
    }
    set((state) => ({ projects: [project, ...state.projects] }))
    return project
  },

  updateProject: (id, patch) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),

  touchProject: (id) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, lastUsed: new Date().toISOString() } : p)),
    })),

  archiveProject: (id) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, archivedAt: new Date().toISOString() } : p)),
    })),

  restoreProject: (id) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, archivedAt: null } : p)),
    })),

  deleteProject: (id) => set((state) => ({ projects: state.projects.filter((p) => p.id !== id) })),

  createWorkspace: (name) => {
    const workspace: Workspace = {
      id: `ws-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      description: null,
      deleteable: true,
      archivedAt: null,
    }
    set((state) => ({ workspaces: [...state.workspaces, workspace] }))
    return workspace
  },

  archiveWorkspace: (id) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.id === id ? { ...w, archivedAt: new Date().toISOString() } : w)),
    })),

  restoreWorkspace: (id) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.id === id ? { ...w, archivedAt: null } : w)),
    })),

  deleteWorkspace: (id) => set((state) => ({ workspaces: state.workspaces.filter((w) => w.id !== id) })),
}))

export function useProject(id: string): Project | undefined {
  return useAppStore((s) => s.projects.find((p) => p.id === id))
}

export type { Project, Workspace, TemplateListItem }
