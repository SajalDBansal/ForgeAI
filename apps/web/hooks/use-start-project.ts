"use client"

import { useRouter } from "next/navigation"

import { useAppStore } from "@/lib/store"
import type { ProjectMode, ProjectSource, RepoRef } from "@/lib/types"

export interface StartProjectInput {
  prompt: string
  mode: ProjectMode
  source: ProjectSource
  repo?: RepoRef | null
  workspaceId?: string
}

export function useStartProject() {
  const router = useRouter()
  const createProject = useAppStore((s) => s.createProject)

  return function startProject(input: StartProjectInput) {
    const trimmed = input.prompt.trim()
    if (!trimmed) return
    if (input.source === "GITHUB" && !input.repo) return

    const project = createProject({
      prompt: trimmed,
      mode: input.mode,
      source: input.source,
      repo: input.repo,
      workspaceId: input.workspaceId,
    })

    router.push(`/${project.id}`)
  }
}
