"use client"

import { useEffect, useState } from "react"
import type {
  PersonPresence,
  PresenceActivity,
  PresenceActivityKind,
  SandboxEvent,
} from "@forgeAI/shared"
// Value imported from the module, not the barrel: the barrel's `.js` re-exports don't bundle here.
import { FILE_PRESENCE_PING_MS } from "@forgeAI/shared/types/presence"

import type { WorkTab } from "@/components/builder/work-panel"
import { useProjectSocket } from "@/hooks/use-project-socket"

/** How long after the last keystroke in a chat box somebody still counts as writing. */
const WRITING_FOR_MS = 4_000

type Area = "terminal" | "chat-agent" | "chat-team"

// Finds which page area an element belongs to via the nearest `data-activity` attribute.
// Used to tell terminal focus and chat typing apart.
function areaOf(target: EventTarget | null): Area | null {
  if (!(target instanceof Element)) return null
  const value = target.closest("[data-activity]")?.getAttribute("data-activity")
  return value === "terminal" || value === "chat-agent" || value === "chat-team"
    ? value
    : null
}

// Picks the most specific thing this tab is doing, for the presence ping.
// Away beats writing, writing beats the terminal, the terminal beats the open file.
function currentActivity(
  hidden: boolean,
  writingIn: Area | null,
  tab: WorkTab,
  focused: Area | null,
  activeFile: string,
): PresenceActivity {
  if (hidden) return { kind: "away" }
  if (writingIn) return { kind: writingIn }
  if (tab === "code" && focused === "terminal") return { kind: "terminal" }
  if (tab === "code")
    return { kind: "code", ...(activeFile && { path: activeFile }) }
  return { kind: tab satisfies PresenceActivityKind }
}

// Sends this tab's page-wide presence heartbeat and returns everyone's presence.
// Files are only reported while the Code tab is showing.
export function usePresence(
  projectId: string,
  tab: WorkTab,
  openFiles: string[],
  activeFile: string,
): PersonPresence[] {
  const socket = useProjectSocket()
  const [people, setPeople] = useState<PersonPresence[]>([])

  const [focused, setFocused] = useState<Area | null>(null)
  const [writingIn, setWritingIn] = useState<Area | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let writingTimer: ReturnType<typeof setTimeout> | undefined
    const onFocusIn = (e: FocusEvent) => setFocused(areaOf(e.target))
    const onFocusOut = (e: FocusEvent) => setFocused(areaOf(e.relatedTarget))
    // Marks a chat box as being written in, until typing pauses.
    const onInput = (e: Event) => {
      const area = areaOf(e.target)
      if (area !== "chat-agent" && area !== "chat-team") return
      setWritingIn(area)
      clearTimeout(writingTimer)
      writingTimer = setTimeout(() => setWritingIn(null), WRITING_FOR_MS)
    }
    const onVisibility = () => setHidden(document.hidden)

    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("focusout", onFocusOut)
    document.addEventListener("input", onInput)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearTimeout(writingTimer)
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("focusout", onFocusOut)
      document.removeEventListener("input", onInput)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  const activity = currentActivity(hidden, writingIn, tab, focused, activeFile)

  // Strings, so identical renders don't restart the heartbeat.
  const pathsKey = tab === "code" ? openFiles.join("\n") : ""
  const activityKey = `${activity.kind}\n${activity.path ?? ""}`

  useEffect(() => {
    if (!socket) return

    // Stores the list of people from file.presence events.
    const onEvent = (event: SandboxEvent) => {
      if (event.type !== "file.presence" || event.projectId !== projectId)
        return
      setPeople(event.people ?? [])
    }
    socket.on("sandbox:event", onEvent)

    const paths = pathsKey ? pathsKey.split("\n") : []
    const [kind, path] = activityKey.split("\n") as [
      PresenceActivityKind,
      string,
    ]
    // Sends this tab's open files and current activity.
    const ping = () =>
      socket.emit("terminal:command", {
        type: "presence.ping",
        paths,
        activity: { kind, ...(path && { path }) },
      })

    // Ping immediately (and on reconnect) as well as on the timer.
    ping()
    const timer = setInterval(ping, FILE_PRESENCE_PING_MS)
    socket.on("connect", ping)

    return () => {
      socket.off("sandbox:event", onEvent)
      socket.off("connect", ping)
      clearInterval(timer)
    }
  }, [socket, projectId, pathsKey, activityKey])

  return people
}
