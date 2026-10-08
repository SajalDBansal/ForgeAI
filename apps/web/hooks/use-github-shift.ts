"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  githubStatusRequest,
  type RawProjectEvent,
  type ShiftChoice,
} from "@/lib/build"
import { useProjectStore } from "@/lib/project-store"
import { displayToast } from "@/lib/toast"
import { useProjectSocket } from "@/hooks/use-project-socket"

/** A focus of the tab re-checks GitHub at most this often. */
const FOCUS_CHECK_MS = 60_000

/** What the last resolution did, for the "Restore my version" notice. */
export interface ShiftResolution {
  byName: string
  choice: ShiftChoice
  replaced: string[]
  backup: string
}

const CHOICE_WORDS: Record<ShiftChoice, string> = {
  theirs: "took GitHub's changes",
  merge: "merged GitHub's changes",
  mine: "kept ForgeAI's version over GitHub's",
}

// Keeps the project's GitHub status current: on open, when the sandbox is ready, on focus and on events.
// Stores it in the project store so History can pause commits during a shift.
export function useGithubShift(projectId: string, podReady: boolean) {
  const socket = useProjectSocket()
  const github = useProjectStore((s) => s.github)
  const setGithub = useProjectStore((s) => s.setGithub)
  const [resolution, setResolution] = useState<ShiftResolution | null>(null)
  const lastCheck = useRef(0)

  const check = useCallback(
    async (fresh = false) => {
      lastCheck.current = Date.now()
      const result = await githubStatusRequest(projectId, fresh)
      if (result.ok && useProjectStore.getState().projectId === projectId)
        setGithub(result.data)
    },
    [projectId, setGithub],
  )

  useEffect(() => {
    void check()
  }, [check])

  // Shift details need the sandbox, so re-check once it's ready.
  const needsDetails = github?.state === "shift" && !github.details
  useEffect(() => {
    if (podReady && needsDetails) void check(true)
  }, [podReady, needsDetails, check])

  useEffect(() => {
    // Re-checks GitHub when the tab regains focus, at most once a minute.
    const onFocus = () => {
      if (Date.now() - lastCheck.current > FOCUS_CHECK_MS) void check()
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [check])

  useEffect(() => {
    if (!socket) return
    // Re-checks on github.shift; announces github.resolved and offers restorable files.
    const onEvent = (payload: unknown) => {
      const event = payload as RawProjectEvent
      if (event.projectId !== projectId) return
      if (event.type === "github.shift") void check(true)
      if (event.type === "github.resolved") {
        displayToast(`${event.byName} ${CHOICE_WORDS[event.choice]}`)
        if (event.replaced.length) {
          setResolution({
            byName: event.byName,
            choice: event.choice,
            replaced: event.replaced,
            backup: event.backup,
          })
        }
      }
    }
    socket.on("project:event", onEvent)
    return () => {
      socket.off("project:event", onEvent)
    }
  }, [socket, projectId, check])

  return {
    status: github,
    check,
    resolution,
    dismissResolution: () => setResolution(null),
  }
}
