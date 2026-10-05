"use client"

import { useCallback, useEffect } from "react"

import {
  getProjectDetailRequest,
  listCommitsRequest,
  listMessagesRequest,
  listSecretsRequest,
} from "@/lib/build"
import type { ApiResult } from "@/lib/api-client"
import { useProjectStore } from "@/lib/project-store"
import { displayToast } from "@/lib/toast"

// Fetches everything the project page shows from the database in parallel.
// Used to open a project and to resync after a dropped connection.
export async function fetchProjectData(projectId: string) {
  const [detail, history, secrets, commits] = await Promise.all([
    getProjectDetailRequest(projectId),
    listMessagesRequest(projectId),
    listSecretsRequest(projectId),
    listCommitsRequest(projectId),
  ])
  if (!detail.ok) return detail
  if (!history.ok) return history
  if (!secrets.ok) return secrets
  if (!commits.ok) return commits

  return {
    ok: true as const,
    data: {
      project: detail.data.project,
      info: detail.data.info,
      messages: history.data.messages,
      hasMoreMessages: history.data.hasMore,
      secrets: secrets.data,
      commits: commits.data,
    },
  } satisfies ApiResult<unknown>
}

// Loads the opened project into the project store, and clears it on unmount.
// Called once where the project page mounts.
export function useLoadProject(projectId: string) {
  const startLoad = useProjectStore((s) => s.startLoad)
  const hydrate = useProjectStore((s) => s.hydrate)
  const failLoad = useProjectStore((s) => s.failLoad)
  const reset = useProjectStore((s) => s.reset)

  useEffect(() => {
    startLoad(projectId)
    void (async () => {
      const result = await fetchProjectData(projectId)
      if (!result.ok) {
        failLoad(projectId, result.message)
        return
      }
      hydrate(projectId, result.data)
    })()

    // Leaving the page drops the project so no other page reads stale data.
    return () => reset()
  }, [projectId, startLoad, hydrate, failLoad, reset])
}

// Returns a function that loads the next older page of the agent chat.
// Ignores calls while a page is loading or when the project changed meanwhile.
export function useLoadOlderMessages() {
  const prependMessages = useProjectStore((s) => s.prependMessages)
  const setLoading = useProjectStore((s) => s.setLoadingOlderMessages)

  return useCallback(async () => {
    const { projectId, messages, loadingOlderMessages } =
      useProjectStore.getState()
    const oldest = messages[0]
    if (!projectId || !oldest || loadingOlderMessages) return

    setLoading(true)
    const result = await listMessagesRequest(projectId, oldest.id)
    setLoading(false)
    if (!result.ok) {
      displayToast(result.message)
      return
    }
    // The user may have opened another project while this was in flight.
    if (useProjectStore.getState().projectId !== projectId) return
    prependMessages(result.data.messages, result.data.hasMore)
  }, [prependMessages, setLoading])
}
