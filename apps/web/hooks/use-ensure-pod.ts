"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { ensurePodRequest } from "@/lib/sandbox"
import { useProjectStore } from "@/lib/project-store"
import type { EnsurePodResponse } from "@/lib/types"

/** After this long the waiting screen says it's a cold start (a warm re-attach takes < 1 s). */
const SLOW_BOOT_MS = 15_000

/** How often a "busy" refusal is retried by itself (the API's Retry-After). */
const BUSY_RETRY_MS = 30_000

/** A project the user can open, listed when the owner's limit stops a new environment. */
export interface RunningProject {
  id: string
  name: string
}

// Reads the running projects from an owner-limit refusal's body (E15).
function runningProjectsOf(body: unknown): RunningProject[] {
  const projects = (body as { projects?: unknown } | undefined)?.projects
  return Array.isArray(projects)
    ? projects.filter(
        (p): p is RunningProject =>
          typeof p?.id === "string" && typeof p?.name === "string",
      )
    : []
}

// Adds a local-only chat notice: "environment ready" for the creator, "connected" for everyone else.
// Never stored or broadcast; it's about this visit, not the project.
function showPodNotice(pod: EnsurePodResponse): void {
  const text = pod.created
    ? pod.templateName
      ? `Your coding environment is ready — set up from the ${pod.templateName} template.`
      : "Your coding environment is ready."
    : "You were connected to the coding environment of this project."

  useProjectStore.getState().addMessage({
    id: `local-pod-${pod.created ? "created" : "connected"}-${Date.now()}`,
    role: "system",
    kind: "success",
    text,
    timestamp: new Date().toISOString(),
  })
}

export type PodState =
  | { status: "creating"; slow: boolean }
  /** The whole ensure response, which also carries the current dev-server and save status. */
  | { status: "ready"; pod: EnsurePodResponse }
  /** Every environment is taken; retried by itself every 30 s until one frees. */
  | { status: "busy" }
  /** `projects` comes with the owner-limit refusal, so one can be closed. */
  | { status: "error"; message: string; projects?: RunningProject[] }

export interface EnsurePodResult {
  state: PodState
  /** Retries after an error or while busy (only from those states, so it can't double-request). */
  retry: () => void
  /** Asks for a sandbox again from any state, e.g. after it was reaped for idleness. */
  reopen: () => void
  /** Quietly re-asks after a reconnect to catch up on dev-server and save status (only when ready). */
  refresh: () => void
}

// Makes sure the open project has a sandbox, starting one if needed, without blocking render.
// Exposes retry/reopen/refresh for errors, reaped sandboxes and reconnects.
export function useEnsurePod(projectId: string): EnsurePodResult {
  const [state, setState] = useState<PodState>({
    status: "creating",
    slow: false,
  })

  // One request per project (survives StrictMode's double effect); also drops replies for a project we've left.
  const requested = useRef<string>("")
  const slowTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const busyTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [attempt, setAttempt] = useState(0)

  // A pending busy retry must not fire after the builder closes.
  useEffect(() => () => clearTimeout(busyTimer.current), [])

  useEffect(() => {
    if (requested.current === projectId) return
    requested.current = projectId
    clearTimeout(busyTimer.current)
    // A busy retry keeps showing "busy" rather than flashing the setup screen.
    setState((current) =>
      current.status === "busy" ? current : { status: "creating", slow: false },
    )

    // Cleared by the next attempt or the reply, not an effect cleanup (StrictMode would disarm it).
    clearTimeout(slowTimer.current)
    slowTimer.current = setTimeout(() => {
      // Only changes the waiting copy; the request keeps going.
      setState((current) =>
        current.status === "creating"
          ? { status: "creating", slow: true }
          : current,
      )
    }, SLOW_BOOT_MS)

    void (async () => {
      const result = await ensurePodRequest(projectId)
      clearTimeout(slowTimer.current)
      if (requested.current !== projectId) return

      if (result.ok) {
        showPodNotice(result.data)
        setState({ status: "ready", pod: result.data })
      } else if (result.code === "SANDBOX_BUSY") {
        setState({ status: "busy" })
        busyTimer.current = setTimeout(() => {
          requested.current = ""
          setAttempt((n) => n + 1)
        }, BUSY_RETRY_MS)
      } else if (result.code === "OWNER_LIMIT") {
        setState({
          status: "error",
          message: result.message,
          projects: runningProjectsOf(result.body),
        })
      } else {
        setState({ status: "error", message: result.message })
      }
    })()
    // `attempt` is what re-runs this after `retry` releases the ref.
  }, [projectId, attempt])

  const retry = useCallback(() => {
    if (state.status !== "error" && state.status !== "busy") return
    clearTimeout(busyTimer.current)
    // Clear the guard and bump `attempt` so the effect runs again.
    requested.current = ""
    setAttempt((n) => n + 1)
  }, [state.status])

  const reopen = useCallback(() => {
    clearTimeout(busyTimer.current)
    requested.current = ""
    setState({ status: "creating", slow: false })
    setAttempt((n) => n + 1)
  }, [])

  const refresh = useCallback(() => {
    if (state.status !== "ready") return
    void (async () => {
      const result = await ensurePodRequest(projectId)
      if (requested.current !== projectId || !result.ok) return
      // Only announce when a new sandbox came up while we were away.
      if (result.data.created) showPodNotice(result.data)
      setState((current) =>
        current.status === "ready"
          ? { status: "ready", pod: result.data }
          : current,
      )
    })()
  }, [state.status, projectId])

  return { state, retry, reopen, refresh }
}
