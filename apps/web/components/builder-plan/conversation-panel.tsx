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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  return (
    <>
      <div className="px-4 py-2.5 hairline-b text-[11px] text-mute flex items-center justify-between">
        <span>[ planning chat ]</span>
        <span>{messages.length} events</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-4 dark-scroll">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] bg-ink text-on-primary px-3.5 py-2.5 rounded-sm text-sm whitespace-pre-wrap">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-3">
              <div className="h-6 w-6 shrink-0 grid place-items-center bg-surface-card text-ink rounded-sm text-[10px] font-bold mt-0.5">
                F/
              </div>
              <p className="text-sm text-body whitespace-pre-wrap min-w-0 flex-1">{m.text}</p>
            </div>
          )
        )}
      </div>
      <div className="hairline-t bg-canvas">
        <div className="px-3 pt-2 flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => send(c)}
              className="text-[11px] px-2 py-1 bg-surface-soft text-body border border-hairline rounded-sm hover:bg-surface-card"
            >
              <span className="text-mute mr-1">/</span>
              {c}
            </button>
          ))}
        </div>
        <div className="p-3">
          <div className="border border-hairline rounded-sm focus-within:border-ink">
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
              className="w-full bg-transparent px-3 py-2 text-sm resize-none focus:outline-none placeholder:text-stone"
            />
            <div className="px-2 pb-2 flex items-center gap-1">
              <button
                onClick={() => displayToast("Attach (mock)")}
                className="h-7 w-7 grid place-items-center text-mute hover:bg-surface-soft rounded-sm"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => displayToast("Voice (mock)")}
                className="h-7 w-7 grid place-items-center text-mute hover:bg-surface-soft rounded-sm"
              >
                <Mic className="h-3.5 w-3.5" />
              </button>
              <span className="text-[11px] text-mute ml-2">↵ send · ⇧↵ newline</span>
              <button
                onClick={() => send()}
                disabled={!composer.trim()}
                className="ml-auto h-7 px-3 bg-ink text-on-primary text-xs rounded-sm flex items-center gap-1.5 disabled:bg-surface-card disabled:text-ash"
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
