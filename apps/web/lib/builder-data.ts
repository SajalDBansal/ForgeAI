"use client"

import type { ProjectSource, RepoRef } from "@/lib/types"

export const SESSION_KEYS = {
  prompt: "forge.prompt",
  mode: "forge.mode",
  source: "forge.source",
  repo: "forge.repo",
  workspaceId: "forge.workspaceId",
} as const

export function projectNameFromPrompt(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 28)
    .replace(/^-|-$/g, "")
  return slug || "new-project"
}

export function readSessionSource(): { source: ProjectSource; repo: RepoRef | null } {
  if (typeof window === "undefined") return { source: "MANUAL", repo: null }
  const raw = sessionStorage.getItem(SESSION_KEYS.source)
  const source: ProjectSource = raw === "GITHUB" ? "GITHUB" : "MANUAL"
  let repo: RepoRef | null = null
  try {
    const stored = sessionStorage.getItem(SESSION_KEYS.repo)
    if (stored) repo = JSON.parse(stored) as RepoRef
  } catch {
    repo = null
  }
  return { source, repo }
}

export function readSessionWorkspaceId(): string | null {
  if (typeof window === "undefined") return null
  return sessionStorage.getItem(SESSION_KEYS.workspaceId)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function repoForNewProject(projectName: string): RepoRef | null {
  return null
}

export function randomCommitHash(): string {
  return Math.random().toString(16).slice(2, 9)
}

export interface Commit {
  id: string
  hash: string
  author: string
  time: string
  prompt: string
  files: number
  additions: number
  deletions: number
  current?: boolean
}

export const INITIAL_COMMITS: Commit[] = []

export interface Secret {
  key: string
  value: string
  scope: string
  updated: string
}

export const INITIAL_SECRETS: Secret[] = []

export interface TermLine {
  t: "cmd" | "info" | "ok" | "err"
  v: string
}

export const INITIAL_TERM_LINES: TermLine[] = []

export const STREAM_LINES: TermLine[] = []
