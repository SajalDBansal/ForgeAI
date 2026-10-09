"use client"

import { useEffect, useRef } from "react"
import { Mic, Paperclip, Send } from "lucide-react"

import { useProjectStore } from "@/lib/project-store"
import { useLoadOlderMessages } from "@/hooks/use-load-project"
import { displayToast } from "@/lib/toast"
import { cancelAgentRunRequest } from "@/lib/build"
import { MessageRow } from "@/components/builder/message-row"
import { AgentLive } from "@/components/builder/agent-live"
import { useAgentLive } from "@/hooks/use-agent-live"

const COMMAND_CHIPS: string[] = []

// The agent chat: message history with "load earlier" and the composer.
// Enter sends; Shift+Enter adds a new line.
export function ConversationPanel({
  composer,
  setComposer,
  send,
  onOpenFile,
}: {
  composer: string
  setComposer: (s: string) => void
  send: (t?: string) => void
  /** Opens a file the agent's knowledge search found (Q6). */
  onOpenFile?: (path: string) => void
}) {
  const messages = useProjectStore((s) => s.messages)
  const projectId = useProjectStore((s) => s.projectId)
  const hasMore = useProjectStore((s) => s.hasMoreMessages)
  const loadingOlder = useProjectStore((s) => s.loadingOlderMessages)
  const loadOlder = useLoadOlderMessages()
  const liveRuns = useAgentLive()
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastId = messages[messages.length - 1]?.id
  // Follow the newest message only — loading older history shouldn't jump to the bottom.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [lastId])
  // Keep a reply that's being written in view, unless the person scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120)
      el.scrollTop = el.scrollHeight
  }, [liveRuns])
  const cancelRun = async (runId: string) => {
    if (!projectId) return
    const result = await cancelAgentRunRequest(projectId, runId)
    displayToast(result.ok ? "Agent run stopped." : result.message)
  }

  return (
    <>
      <div
        ref={scrollRef}
        className="dark-scroll flex-1 space-y-5 overflow-y-auto px-4 py-5"
      >
        {hasMore && (
          <div className="text-center">
            <button
              onClick={() => void loadOlder()}
              disabled={loadingOlder}
              className="border-hairline text-mute hover:text-ink hover:bg-surface-soft rounded-sm border px-2.5 py-1 text-[11px] disabled:opacity-50"
            >
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}
        {messages.map((m) => (
          <MessageRow key={m.id} m={m} onAnswer={(opt) => send(opt)} />
        ))}
        <AgentLive
          runs={liveRuns}
          onOpenFile={onOpenFile}
          onCancelRun={(runId) => void cancelRun(runId)}
        />
      </div>

      <div className="hairline-t bg-canvas">
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {COMMAND_CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => send(c)}
              className="bg-surface-soft text-body border-hairline hover:bg-surface-card rounded-sm border px-2 py-1 text-[11px]"
            >
              <span className="text-mute mr-1">/</span>
              {c}
            </button>
          ))}
        </div>
        <div className="p-3">
          <div className="border-hairline focus-within:border-ink rounded-sm border">
            <textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={2}
              placeholder="Ask for a change, add a feature, or answer the agent…"
              className="placeholder:text-stone w-full resize-none bg-transparent px-3 py-2 text-sm focus:outline-none"
            />
            <div className="flex items-center gap-1 px-2 pb-2">
              <button
                onClick={() => displayToast("Attach (mock)")}
                className="text-mute hover:bg-surface-soft grid h-7 w-7 place-items-center rounded-sm"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => displayToast("Voice (mock)")}
                className="text-mute hover:bg-surface-soft grid h-7 w-7 place-items-center rounded-sm"
              >
                <Mic className="h-3.5 w-3.5" />
              </button>
              <span className="text-mute ml-2 text-[11px]">
                ↵ send · ⇧↵ newline
              </span>
              <button
                onClick={() => send()}
                disabled={!composer.trim()}
                className="bg-ink text-on-primary disabled:bg-surface-card disabled:text-ash ml-auto flex h-7 items-center gap-1.5 rounded-sm px-3 text-xs"
              >
                <Send className="h-3 w-3" /> Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
