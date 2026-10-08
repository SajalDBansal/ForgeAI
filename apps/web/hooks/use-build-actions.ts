"use client"

import { useCallback } from "react"

import {
  deleteSecretRequest,
  revealSecretRequest,
  sendMessageRequest,
  upsertSecretRequest,
  type SecretSummary,
} from "@/lib/build"
import { useProjectStore } from "@/lib/project-store"
import { useSession } from "@/hooks/use-session"
import { displayToast } from "@/lib/toast"

// Returns the open project's id at call time.
// Lets actions run from any section without threading the id through props.
function openProjectId(): string | null {
  return useProjectStore.getState().projectId
}

// Optimistic mutations on the open project: update the store, call the API, reconcile or roll back.
// Covers chat messages and secrets; socket echoes of the same change are no-ops.
export function useBuildActions() {
  const applyEvent = useProjectStore((s) => s.applyEvent)
  const addMessage = useProjectStore((s) => s.addMessage)
  const replaceMessage = useProjectStore((s) => s.replaceMessage)
  const removeMessage = useProjectStore((s) => s.removeMessage)
  const upsertSecret = useProjectStore((s) => s.upsertSecret)
  const removeSecret = useProjectStore((s) => s.removeSecret)
  const { session } = useSession()
  const myId = session?.user?.id
  const myName = session?.user?.name ?? ""

  const sendMessage = useCallback(
    async (text: string): Promise<boolean> => {
      const projectId = openProjectId()
      const content = text.trim()
      if (!projectId || !content) return false

      const tempId = `tmp-${Date.now().toString(36)}`
      addMessage({
        id: tempId,
        role: "user",
        kind: "text",
        text: content,
        timestamp: new Date().toISOString(),
        author: myId ? { id: myId, name: myName } : null,
      })

      const result = await sendMessageRequest(projectId, content)
      if (!result.ok) {
        removeMessage(tempId)
        displayToast(result.message)
        return false
      }
      replaceMessage(tempId, result.data)
      return true
    },
    [addMessage, replaceMessage, removeMessage, myId, myName],
  )

  const saveSecret = useCallback(
    async (key: string, value: string): Promise<boolean> => {
      const projectId = openProjectId()
      if (!projectId) return false
      const normalized = key.trim().toUpperCase()
      const previous = upsertSecret({
        id: `tmp-${normalized}`,
        key: normalized,
        scope: "RUNTIME",
        updatedAt: new Date().toISOString(),
      })

      const result = await upsertSecretRequest(projectId, {
        key: normalized,
        value,
      })
      if (!result.ok) {
        if (previous) upsertSecret(previous)
        else removeSecret(`tmp-${normalized}`)
        displayToast(result.message)
        return false
      }
      applyEvent({ type: "secret.upserted", projectId, secret: result.data })
      displayToast(`Saved ${normalized}`)
      return true
    },
    [applyEvent, upsertSecret, removeSecret],
  )

  const deleteSecret = useCallback(
    async (secret: SecretSummary) => {
      const projectId = openProjectId()
      if (!projectId) return
      const removed = removeSecret(secret.id)
      if (!removed) return

      const result = await deleteSecretRequest(projectId, secret.id)
      if (!result.ok) {
        upsertSecret(removed)
        displayToast(result.message)
        return
      }
      displayToast(`Removed ${secret.key}`)
    },
    [removeSecret, upsertSecret],
  )

  // A revealed value stays in the component that asked; nothing is stored.
  const revealSecret = useCallback(
    async (secret: SecretSummary): Promise<string | null> => {
      const projectId = openProjectId()
      if (!projectId) return null
      const result = await revealSecretRequest(projectId, secret.id)
      if (!result.ok) {
        displayToast(result.message)
        return null
      }
      return result.data
    },
    [],
  )

  return { sendMessage, saveSecret, deleteSecret, revealSecret }
}
