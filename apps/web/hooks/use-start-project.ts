"use client"

import { useRouter } from "next/navigation"

import { useIdempotencyKey } from "@/hooks/use-idempotency-key"
import { isInProgress } from "@/lib/api-client"
import { createProjectRequest } from "@/lib/projects"
import { useAppStore } from "@/lib/store"
import { displayToast } from "@/lib/toast"
import type {
  CreateProjectDataType,
  ProjectMode,
  ProjectSource,
} from "@/lib/types"

export interface StartProjectInput {
  prompt?: string
  mode: ProjectMode
  source: ProjectSource
  repo?: CreateProjectDataType["repo"] | null
  workspaceId?: string
  name?: string
  templateId?: string
}

// Returns a function that creates a project optimistically, then opens it on success.
// `prompt` is optional with a template; the server writes a default opening prompt.
export function useStartProject() {
  const router = useRouter()
  const createProject = useAppStore((s) => s.createProject)
  const replaceProject = useAppStore((s) => s.replaceProject)
  const deleteProject = useAppStore((s) => s.deleteProject)
  const idempotency = useIdempotencyKey()

  // Validates input, adds a placeholder, creates it on the server and navigates to it.
  return async function startProject(
    input: StartProjectInput,
  ): Promise<boolean> {
    const trimmed = input.prompt?.trim() ?? ""
    if (!trimmed && !input.templateId) return false
    if (input.source === "GITHUB" && !input.repo) return false

    const optimistic = createProject({
      prompt: trimmed,
      mode: input.mode,
      source: input.source,
      repo: input.repo,
      workspaceId: input.workspaceId,
      name: input.name,
      templateId: input.templateId,
    })

    const payload = {
      mode: input.mode,
      source: input.source,
      workspaceId: input.workspaceId,
      ...(trimmed && { initialPrompt: trimmed }),
      ...(input.name && { name: input.name }),
      ...(input.templateId && { templateId: input.templateId }),
      ...(input.source === "GITHUB" && input.repo && { repo: input.repo }),
    }
    const result = await createProjectRequest(
      payload,
      idempotency.key(JSON.stringify(payload)),
    )
    if (!result.ok) {
      deleteProject(optimistic.id)
      if (!isInProgress(result)) displayToast(result.message)
      return false
    }
    idempotency.renew()

    // Swap the placeholder for the server row (real id).
    replaceProject(optimistic.id, result.data)
    router.push(`/${result.data.id}`)
    return true
  }
}
