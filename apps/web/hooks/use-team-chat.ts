"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  listTeamMessagesRequest,
  markTeamChatReadRequest,
  sendTeamMessageRequest,
  type RawProjectEvent,
  type TeamChatMessage,
} from "@/lib/build"
import { displayToast } from "@/lib/toast"
import { useOnReconnect, useProjectSocket } from "@/hooks/use-project-socket"
import { useSession } from "@/hooks/use-session"

/** Debounce before reporting "read up to here", so a burst of messages is one request. */
const MARK_READ_DEBOUNCE_MS = 800

export interface TeamChat {
  status: "loading" | "ready" | "error"
  messages: TeamChatMessage[]
  hasMore: boolean
  loadingOlder: boolean
  /** Unseen messages from other people: the number on the tab. */
  unread: number
  /** The last message read; the panel reads it once on open to know where to start. */
  lastReadSeq: number
  myUserId: string
  send: (content: string, mentions: string[]) => Promise<boolean>
  loadOlder: () => Promise<void>
}

// Merges messages by id and sorts them by sequence number.
// Makes socket and HTTP deliveries of the same message land once, in order.
function mergeBySeq(
  current: TeamChatMessage[],
  incoming: TeamChatMessage[],
): TeamChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.seq - b.seq)
}

// Loads and follows the project's Team chat, tracking unread messages and paging back.
// While `visible` (and the browser tab is showing), everything that arrives counts as read.
export function useTeamChat(projectId: string, visible: boolean): TeamChat {
  const socket = useProjectSocket()
  const { session } = useSession()
  const myUserId = session?.user?.id ?? ""

  const [status, setStatus] = useState<TeamChat["status"]>("loading")
  const [messages, setMessages] = useState<TeamChatMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [lastReadSeq, setLastReadSeq] = useState(0)
  const [unread, setUnread] = useState(0)

  // A background browser tab isn't reading.
  const [pageVisible, setPageVisible] = useState(true)
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden)
    update()
    document.addEventListener("visibilitychange", update)
    return () => document.removeEventListener("visibilitychange", update)
  }, [])
  const reading = visible && pageVisible && status === "ready"

  const loadLatest = useCallback(async () => {
    const result = await listTeamMessagesRequest(projectId)
    if (!result.ok) {
      setStatus((s) => (s === "ready" ? s : "error"))
      return
    }
    // Merge so older pages survive a reconnect.
    setMessages((current) => mergeBySeq(current, result.data.messages))
    setHasMore((was) => was || result.data.hasMore)
    setLastReadSeq(result.data.lastReadSeq)
    setUnread(result.data.unread)
    setStatus("ready")
  }, [projectId])

  useEffect(() => {
    // State is only set after the request answers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLatest()
  }, [loadLatest])

  // Catch up on messages missed while disconnected.
  useOnReconnect(() => void loadLatest())

  useEffect(() => {
    if (!socket) return
    // Adds new Team messages and counts other people's as unread.
    const onEvent = (payload: unknown) => {
      const event = payload as RawProjectEvent
      if (
        event.type !== "team.message.created" ||
        event.projectId !== projectId
      )
        return
      const message = event.teamMessage
      setMessages((current) =>
        current.some((m) => m.id === message.id)
          ? current
          : mergeBySeq(current, [message]),
      )
      if (message.author?.id !== myUserId) {
        setUnread((n) => n + 1)
      }
    }
    socket.on("project:event", onEvent)
    return () => {
      socket.off("project:event", onEvent)
    }
  }, [socket, projectId, myUserId])

  // ---- reading ----

  const latestSeq = messages[messages.length - 1]?.seq ?? 0

  const markTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (!reading || latestSeq <= lastReadSeq) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnread(0)
    setLastReadSeq(latestSeq)
    clearTimeout(markTimer.current)
    markTimer.current = setTimeout(() => {
      void markTeamChatReadRequest(projectId, latestSeq)
    }, MARK_READ_DEBOUNCE_MS)
  }, [reading, latestSeq, lastReadSeq, projectId])

  // ---- actions ----

  const send = useCallback(
    async (content: string, mentions: string[]) => {
      const result = await sendTeamMessageRequest(projectId, content, mentions)
      if (!result.ok) {
        displayToast(result.message)
        return false
      }
      // The socket delivers it too; merging by id dedupes.
      setMessages((current) => mergeBySeq(current, [result.data]))
      setLastReadSeq((seq) => Math.max(seq, result.data.seq))
      return true
    },
    [projectId],
  )

  const loadingOlderRef = useRef(false)
  const loadOlder = useCallback(async () => {
    const oldest = messages[0]
    if (!oldest || !hasMore || loadingOlderRef.current) return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    const result = await listTeamMessagesRequest(projectId, oldest.seq)
    loadingOlderRef.current = false
    setLoadingOlder(false)
    if (!result.ok) {
      displayToast(result.message)
      return
    }
    setMessages((current) => mergeBySeq(current, result.data.messages))
    setHasMore(result.data.hasMore)
  }, [messages, hasMore, projectId])

  return {
    status,
    messages,
    hasMore,
    loadingOlder,
    unread,
    lastReadSeq,
    myUserId,
    send,
    loadOlder,
  }
}
