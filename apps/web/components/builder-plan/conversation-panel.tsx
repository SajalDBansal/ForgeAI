"use client"

import { useEffect, useRef } from "react"
import { Mic, Paperclip, Send } from "lucide-react"

import { displayToast } from "@/lib/toast"

export interface PlanMsg {
  id: string
  role: "user" | "agent"
  text: string
  ts: string
}

const CHIPS: string[] = []

// Planning chat: message list plus a composer (Enter sends, Shift+Enter adds a line).
// Scrolls to the newest message whenever the list changes.
export function ConversationPanel({
  messages,
  composer,
  setComposer,
  send,
}: {
  messages: PlanMsg[]
  composer: string
  setComposer: (s: string) => void
  send: (t?: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages])

  return (
    <>
      <div className="hairline-b text-mute flex items-center justify-between px-4 py-2.5 text-[11px]">
        <span>[ planning chat ]</span>
        <span>{messages.length} events</span>
      </div>
      <div
        ref={scrollRef}
        className="dark-scroll flex-1 space-y-4 overflow-y-auto px-4 py-5"
      >
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="bg-ink text-on-primary max-w-[85%] rounded-sm px-3.5 py-2.5 text-sm whitespace-pre-wrap">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-3">
              <div className="bg-surface-card text-ink mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-sm text-[10px] font-bold">
                F/
              </div>
              <p className="text-body min-w-0 flex-1 text-sm whitespace-pre-wrap">
                {m.text}
              </p>
            </div>
          ),
        )}
      </div>
      <div className="hairline-t bg-canvas">
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {CHIPS.map((c) => (
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
              placeholder="Refine the plan — ask the agent to adjust scope, schema, or roadmap…"
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
