"use client"

import { create } from "zustand"
import type { ProjectPatch } from "@forgeAI/shared"

import type {
  BuildEvent,
  Commit,
  GithubStatus,
  ProjectInfoData,
  SecretSummary,
} from "@/lib/build"
import type { Message, Project } from "@/lib/types"

// The web app only imports types from @forgeAI/shared, so the empty Info document is spelled out here.
// Typed as ProjectInfoData, so a new schema section fails to compile until added.
const EMPTY_INFO: ProjectInfoData = {
  brief: [],
  planSteps: [],
  requirements: [],
  timeline: [],
  filesChanged: [],
  dependencies: [],
  colors: [],
  disclaimers: [],
  sessionId: null,
}

interface ProjectHydration {
  project: Project
  info: ProjectInfoData
  messages: Message[]
  hasMoreMessages: boolean
  secrets: SecretSummary[]
  commits: Commit[]
}

/** Everything loaded for the open project; every builder section reads from here. Fetching lives in hooks. */
interface ProjectData {
  projectId: string | null
  status: "idle" | "loading" | "ready" | "error"
  error: string | null

  project: Project | null
  info: ProjectInfoData
  messages: Message[]
  hasMoreMessages: boolean
  loadingOlderMessages: boolean
  secrets: SecretSummary[]
  commits: Commit[]
  /** Where GitHub stands (set by useGithubShift); null until first checked. */
  github: GithubStatus | null
}

interface ProjectState extends ProjectData {
  startLoad: (projectId: string) => void
  hydrate: (projectId: string, data: ProjectHydration) => void
  /** Catches up after a reconnect; merges the chat (keeping local-only messages) instead of replacing it. */
  resync: (
    projectId: string,
    data: Omit<ProjectHydration, "hasMoreMessages">,
  ) => void
  failLoad: (projectId: string, error: string) => void
  reset: () => void

  setLoadingOlderMessages: (loading: boolean) => void
  prependMessages: (messages: Message[], hasMore: boolean) => void

  /** Applies a project event from HTTP or the socket. Idempotent. */
  applyEvent: (event: BuildEvent) => void

  updateProject: (patch: ProjectPatch) => ProjectPatch | null
  addMessage: (message: Message) => void
  replaceMessage: (id: string, message: Message) => void
  removeMessage: (id: string) => void
  upsertSecret: (secret: SecretSummary) => SecretSummary | null
  removeSecret: (id: string) => SecretSummary | null
  setHead: (commitId: string) => string | null
  setGithub: (status: GithubStatus | null) => void
}

const EMPTY: ProjectData = {
  projectId: null,
  status: "idle",
  error: null,
  project: null,
  info: EMPTY_INFO,
  messages: [],
  hasMoreMessages: false,
  loadingOlderMessages: false,
  secrets: [],
  commits: [],
  github: null,
}

// Replaces the item with the same id, or appends it if new.
// Makes event application idempotent.
function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [...list, item]
}

// Puts a newly created commit first, clearing the old HEAD flag if the new one is HEAD.
// Drops any existing copy of the same commit.
function withNewCommit(commits: Commit[], commit: Commit): Commit[] {
  return [
    commit,
    ...commits
      .filter((c) => c.id !== commit.id)
      .map((c) => (commit.isHead ? { ...c, isHead: false } : c)),
  ]
}

// Merges the commits a GitHub-shift resolution brought in and re-marks HEAD from the repo.
// Keeps History sorted newest first.
function withResolvedCommits(
  commits: Commit[],
  incomingCommits: Commit[],
  head: string | null | undefined,
): Commit[] {
  const incoming = new Map(incomingCommits.map((c) => [c.id, c]))
  return [...incomingCommits, ...commits.filter((c) => !incoming.has(c.id))]
    .map((c) => ({ ...c, isHead: c.hash === head }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// Store for the currently open project: data, chat, secrets, commits and GitHub status.
// Reset whenever a different project is opened.
export const useProjectStore = create<ProjectState>()((set, get) => ({
  ...EMPTY,

  startLoad: (projectId) => set({ ...EMPTY, projectId, status: "loading" }),

  hydrate: (projectId, data) => {
    if (get().projectId !== projectId) return
    set({ ...data, status: "ready", error: null })
  },

  resync: (projectId, data) => {
    if (get().projectId !== projectId) return
    set((state) => {
      let messages = state.messages
      for (const message of data.messages)
        messages = upsertById(messages, message)
      // Re-sort by time (stable) since missed messages were appended.
      messages = [...messages].sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp),
      )
      return {
        project: data.project,
        info: data.info,
        secrets: data.secrets,
        commits: data.commits,
        messages,
      }
    })
  },

  failLoad: (projectId, error) => {
    if (get().projectId !== projectId) return
    set({ status: "error", error })
  },

  reset: () => set(EMPTY),

  setLoadingOlderMessages: (loading) => set({ loadingOlderMessages: loading }),

  prependMessages: (messages, hasMore) =>
    set((state) => {
      const known = new Set(state.messages.map((m) => m.id))
      return {
        messages: [
          ...messages.filter((m) => !known.has(m.id)),
          ...state.messages,
        ],
        hasMoreMessages: hasMore,
      }
    }),

  applyEvent: (event) => {
    if (event.projectId !== get().projectId) return

    switch (event.type) {
      case "project.updated":
        get().updateProject(event.project)
        return
      case "message.created":
        set((state) => ({
          messages: upsertById(state.messages, event.message),
        }))
        return
      case "secret.upserted":
        get().upsertSecret(event.secret)
        return
      case "secret.deleted":
        get().removeSecret(event.secretId)
        return
      case "commit.created":
        set((state) => ({
          commits: withNewCommit(state.commits, event.commit),
        }))
        return
      case "commit.head":
        get().setHead(event.commitId)
        return
      case "github.resolved":
        set((state) => {
          return {
            commits: withResolvedCommits(
              state.commits,
              event.commits,
              event.repo.lastKnownSha,
            ),
            github: { state: "same", repo: event.repo },
            ...(state.project && {
              project: { ...state.project, repo: event.repo },
            }),
          }
        })
        return
      case "commit.updated":
        set((state) => ({
          commits: state.commits.map((c) =>
            c.id === event.commit.id ? event.commit : c,
          ),
          ...(event.repo &&
            state.project && {
              project: { ...state.project, repo: event.repo },
            }),
        }))
        return
      case "info.updated":
        set({ info: event.info })
        return
    }
  },

  // Returns the previous values of the patched fields, so a caller can roll back.
  updateProject: (patch) => {
    const project = get().project
    if (!project) return null
    const previous = Object.fromEntries(
      Object.keys(patch).map((k) => [k, project[k as keyof ProjectPatch]]),
    ) as ProjectPatch
    set({ project: { ...project, ...patch } })
    return previous
  },

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  replaceMessage: (id, message) =>
    set((state) => ({
      // The real message may already be here if it arrived over the socket first.
      messages: state.messages
        .filter((m) => m.id !== message.id)
        .map((m) => (m.id === id ? message : m)),
    })),

  removeMessage: (id) =>
    set((state) => ({ messages: state.messages.filter((m) => m.id !== id) })),

  // Keys are unique per project, so a secret is matched by key — that also swaps an optimistic row for the saved one.
  upsertSecret: (secret) => {
    const previous = get().secrets.find((s) => s.key === secret.key) ?? null
    set((state) => ({
      secrets: previous
        ? state.secrets.map((s) => (s.key === secret.key ? secret : s))
        : [...state.secrets, secret].sort((a, b) => a.key.localeCompare(b.key)),
    }))
    return previous
  },

  removeSecret: (id) => {
    const removed = get().secrets.find((s) => s.id === id) ?? null
    if (removed)
      set((state) => ({ secrets: state.secrets.filter((s) => s.id !== id) }))
    return removed
  },

  setGithub: (status) => set({ github: status }),

  setHead: (commitId) => {
    const previous = get().commits.find((c) => c.isHead)?.id ?? null
    set((state) => ({
      commits: state.commits.map((c) => ({ ...c, isHead: c.id === commitId })),
    }))
    return previous
  },
}))

// Returns the open project, throwing if used before it has loaded.
// Safe inside builder sections, which only render once the project is ready.
export function useOpenProject(): Project {
  const project = useProjectStore((s) => s.project)
  if (!project) throw new Error("useOpenProject used outside a loaded project")
  return project
}
