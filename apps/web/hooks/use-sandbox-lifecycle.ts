"use client"

import { useEffect, useRef, useState } from "react"

import type { SandboxEvent } from "@forgeAI/shared"

import { useProjectSocket } from "@/hooks/use-project-socket"

export interface SandboxLifecycle {
  /** When the sandbox will be shut down for idleness, or null. */
  reapAt: Date | null
  /** True once it has gone; its work is safe in R2. */
  reaped: boolean
}

// Follows idle-shutdown warnings, reaping and orchestrator resets for the project's sandbox.
// Lets the builder warn before a sandbox disappears and reconnect after a reset.
export function useSandboxLifecycle(
  projectId: string,
  /** Called on `sandbox.reset` (orchestrator restarted); the caller re-ensures the pod. */
  onReset: () => void,
): SandboxLifecycle {
  const socket = useProjectSocket()
  const [reapAt, setReapAt] = useState<Date | null>(null)
  const [reaped, setReaped] = useState(false)

  // Ref so a new callback identity doesn't resubscribe the socket.
  const onResetRef = useRef(onReset)
  useEffect(() => {
    onResetRef.current = onReset
  })

  useEffect(() => {
    if (!socket) return

    // Tracks idle warnings, reaping and resets for this project's sandbox.
    const onEvent = (event: SandboxEvent) => {
      if (event.projectId !== projectId) return

      if (event.type === "sandbox.expiring") {
        setReapAt(event.reapAt ? new Date(event.reapAt) : null)
        return
      }

      if (event.type === "sandbox.reset") {
        onResetRef.current()
        return
      }

      if (event.type === "sandbox.reaped") {
        setReapAt(null)
        setReaped(true)
      }
    }

    socket.on("sandbox:event", onEvent)
    return () => {
      socket.off("sandbox:event", onEvent)
    }
  }, [socket, projectId])

  return { reapAt, reaped }
}
