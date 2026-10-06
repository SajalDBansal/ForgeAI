"use client"

import { useEffect, useMemo, useState } from "react"
import type { FilePresence, SandboxEvent } from "@forgeAI/shared"

import { useProjectSocket } from "@/hooks/use-project-socket"
import { useCollaborators } from "@/hooks/use-collaborators"
import { useSession } from "@/hooks/use-session"

/** Somebody else on a file, as the UI wants them: named, not an id. */
export type PresentPerson = {
  userId: string
  name: string
  editing: boolean
}

// Listens for who else has which file open and who is typing, with names resolved.
// Only listens; this tab's own files are reported by usePresence.
export function useFilePresence(projectId: string): {
  /** Everybody *else* on a path. */
  viewersOf: (path: string) => PresentPerson[]
  /** Paths somebody else has open, for marking up the tree. */
  busyPaths: Set<string>
} {
  const socket = useProjectSocket()
  const { session } = useSession()
  const { collaborators } = useCollaborators()
  const [files, setFiles] = useState<FilePresence[]>([])

  const myUserId = session?.user?.id ?? ""

  useEffect(() => {
    if (!socket) return

    // Stores the latest file.presence picture for this project.
    const onEvent = (event: SandboxEvent) => {
      if (event.type !== "file.presence" || event.projectId !== projectId)
        return
      setFiles(event.files)
    }

    socket.on("sandbox:event", onEvent)
    return () => {
      socket.off("sandbox:event", onEvent)
    }
  }, [socket, projectId])

  // Names come from the collaborator list (keyed by user id), not from the wire.
  const nameOf = useMemo(() => {
    const byId = new Map(
      collaborators.map((row) => [
        row.user.id,
        row.user.name || row.user.email,
      ]),
    )
    return (userId: string) =>
      userId === "forgeai-agent"
        ? "ForgeAI agent"
        : (byId.get(userId) ?? "Someone else")
  }, [collaborators])

  return useMemo(() => {
    const byPath = new Map<string, PresentPerson[]>()

    for (const file of files) {
      // Filter yourself out here; the orchestrator publishes one picture to everyone.
      const others = file.viewers
        .filter((viewer) => viewer.userId !== myUserId)
        .map((viewer) => ({
          userId: viewer.userId,
          name: nameOf(viewer.userId),
          editing: viewer.editing,
        }))

      if (others.length) byPath.set(file.path, others)
    }

    return {
      viewersOf: (path: string) => byPath.get(path) ?? [],
      busyPaths: new Set(byPath.keys()),
    }
  }, [files, myUserId, nameOf])
}
