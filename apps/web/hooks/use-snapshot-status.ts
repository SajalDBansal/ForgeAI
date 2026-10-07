"use client"

import { useCallback, useEffect, useState } from "react"

import type { SandboxEvent, SnapshotStatus } from "@forgeAI/shared"

import { useProjectSocket } from "@/hooks/use-project-socket"

const IDLE: SnapshotStatus = { state: "idle", shrink: null }

export interface Backup {
  /** What saving to object storage is doing right now. */
  status: SnapshotStatus
  /** Whether the "save a much smaller project?" dialog should show (only for a held save). */
  asking: boolean
  /** Set once somebody here has answered, until the orchestrator says what happened. */
  answering: boolean
  /** Answer the question: save the project as it is, or bring the missing files back. */
  resolve: (keep: "new" | "old") => void
  /** Close without answering; the status bar still shows it and `reopen` brings it back. */
  dismiss: () => void
  reopen: () => void
}

// Follows the automatic cloud save and its "large deletion" question, seeded from the pod.
// The first collaborator to answer closes the dialog for everyone.
export function useSnapshotStatus(
  projectId: string,
  seed: SnapshotStatus | undefined,
): Backup {
  const socket = useProjectSocket()

  // Remembers which seed each reported status arrived under, so a newer seed wins.
  const [reported, setReported] = useState<{
    seed: SnapshotStatus | undefined
    status: SnapshotStatus
  } | null>(null)
  // Which question was dismissed/answered; a new held save asks again.
  const [dismissedQuestion, setDismissedQuestion] = useState<string | null>(
    null,
  )
  const [answeredQuestion, setAnsweredQuestion] = useState<string | null>(null)

  const status =
    reported && reported.seed === seed ? reported.status : (seed ?? IDLE)

  useEffect(() => {
    if (!socket) return

    // Records each snapshot.status under the seed it arrived after.
    const onEvent = (event: SandboxEvent) => {
      if (event.projectId !== projectId || event.type !== "snapshot.status")
        return
      setReported({
        seed,
        status: {
          state: event.state,
          savedAt: event.savedAt,
          message: event.message,
          shrink: event.shrink,
        },
      })
    }

    socket.on("sandbox:event", onEvent)
    return () => {
      socket.off("sandbox:event", onEvent)
    }
  }, [socket, projectId, seed])

  // Identified by the stored copy it would replace, which is stable while the question is open.
  const question = status.shrink
    ? `${status.savedAt ?? ""}|${status.shrink.storedFiles}`
    : null

  const resolve = useCallback(
    (keep: "new" | "old") => {
      if (!socket || !question) return
      setAnsweredQuestion(question)
      socket.emit("terminal:command", { type: "snapshot.resolve", keep })
    },
    [socket, question],
  )

  const dismiss = useCallback(() => setDismissedQuestion(question), [question])
  const reopen = useCallback(() => setDismissedQuestion(null), [])

  // A failed answer re-offers the question instead of sticking on "saving…".
  const answering =
    question !== null &&
    answeredQuestion === question &&
    status.state !== "failed"

  return {
    status,
    asking: question !== null && dismissedQuestion !== question,
    answering,
    resolve,
    dismiss,
    reopen,
  }
}
