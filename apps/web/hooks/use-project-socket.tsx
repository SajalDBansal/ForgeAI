"use client"

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { io, type Socket } from "socket.io-client"
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@forgeAI/shared"

import {
  getWsTicketRequest,
  mapProjectEvent,
  type RawProjectEvent,
} from "@/lib/build"
import {
  ACCESS_LOST_MESSAGE,
  createAccessChangeTracker,
  createTicketAuth,
  shouldReconnectAfterDisconnect,
} from "@/lib/project-socket-lifecycle"
import { useProjectStore } from "@/lib/project-store"
import { fetchProjectData } from "@/hooks/use-load-project"
import { displayToast } from "@/lib/toast"
import { PUBLIC_ENV } from "@/lib/env"

const WS_URL = PUBLIC_ENV.WS_URL

/** Backoff for a refused handshake: soon at first, then no more than twice a minute. */
const RETRY_MIN_MS = 1_000
const RETRY_MAX_MS = 30_000

export type ProjectSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/** One socket per open project, shared by chat, terminal, editor and presence. */
const ProjectSocketContext = createContext<ProjectSocket | null>(null)

// Opens the project's live connection and feeds every project event into the store.
// Reconnects with fresh tickets, resyncs after a drop, and reloads when access changes.
export function ProjectSocketProvider({
  projectId,
  children,
}: {
  projectId: string
  children: ReactNode
}) {
  const applyEvent = useProjectStore((s) => s.applyEvent)
  const resync = useProjectStore((s) => s.resync)
  const [socket, setSocket] = useState<ProjectSocket | null>(null)

  useEffect(() => {
    if (!WS_URL) {
      console.warn(
        "NEXT_PUBLIC_WS_URL is not set — live project updates are disabled.",
      )
      return
    }

    let disposed = false
    let reloading = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let retryDelay = RETRY_MIN_MS
    /** Whether a connection was lost, so the next connect must catch up. */
    let dropped = false

    // Access changed: every part of the page depends on the role, so reload rather than patch.
    const accessChanged = (message: string) => {
      if (reloading || disposed) return
      reloading = true
      displayToast(message)
      setTimeout(() => window.location.reload(), 1500)
    }
    const trackAccess = createAccessChangeTracker(accessChanged)

    const next: ProjectSocket = io(WS_URL, {
      transports: ["websocket"],
      auth: createTicketAuth(projectId, getWsTicketRequest, () =>
        accessChanged(ACCESS_LOST_MESSAGE),
      ),
    })

    // Retries a refused handshake with backoff (socket.io only retries network failures).
    const reconnectLater = () => {
      if (disposed || reloading) return
      clearTimeout(retryTimer)
      retryTimer = setTimeout(() => {
        if (!disposed && !next.connected) next.connect()
      }, retryDelay)
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
    }

    next.on("connect", () => {
      retryDelay = RETRY_MIN_MS
      if (!dropped) return
      dropped = false
      // Resync after rejoining so nothing falls between the fetch and live events.
      void fetchProjectData(projectId).then((result) => {
        if (disposed || !result.ok) return
        resync(projectId, result.data)
      })
    })

    next.on("access", trackAccess)

    next.on("disconnect", (reason) => {
      dropped = true
      // socket.io won't reconnect after a server-initiated close, so do it (with a fresh ticket).
      if (shouldReconnectAfterDisconnect(reason)) next.connect()
    })

    next.on("project:event", (payload) => {
      applyEvent(mapProjectEvent(payload as RawProjectEvent))
    })

    next.on("connect_error", (err) => {
      console.warn(
        "[project-socket] connection failed, will retry:",
        err.message,
      )
      if (!next.active) reconnectLater()
    })

    // The socket is an external resource created once per project; children need it as state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(next)
    return () => {
      disposed = true
      clearTimeout(retryTimer)
      setSocket(null)
      next.disconnect()
    }
  }, [projectId, applyEvent, resync])

  return (
    <ProjectSocketContext.Provider value={socket}>
      {children}
    </ProjectSocketContext.Provider>
  )
}

// Returns the open project's socket, or null while it's still connecting.
// Used by every hook that sends commands or listens for sandbox events.
export function useProjectSocket(): ProjectSocket | null {
  return useContext(ProjectSocketContext)
}

// Runs `callback` each time the socket reconnects after a drop (not on the first connect).
// Lets sandbox state outside the project store catch up on events it missed.
export function useOnReconnect(callback: () => void): void {
  const socket = useProjectSocket()
  const latest = useRef(callback)
  useEffect(() => {
    latest.current = callback
  })

  useEffect(() => {
    if (!socket) return
    let dropped = false
    const onDisconnect = () => {
      dropped = true
    }
    const onConnect = () => {
      if (!dropped) return
      dropped = false
      latest.current()
    }
    socket.on("disconnect", onDisconnect)
    socket.on("connect", onConnect)
    return () => {
      socket.off("disconnect", onDisconnect)
      socket.off("connect", onConnect)
    }
  }, [socket])
}
