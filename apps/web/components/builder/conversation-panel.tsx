"use client"

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react"
import { Mic, Paperclip, Send } from "lucide-react"

import type { Message } from "@/lib/types"
import { displayToast } from "@/lib/toast"
import { MessageRow } from "@/components/builder/message-row"

const COMMAND_CHIPS: string[] = []

export function ConversationPanel({
  messages,
  composer,
  setComposer,
  send,
  setMessages,
}: {
  messages: Message[]
  composer: string
  setComposer: (s: string) => void
  send: (t?: string) => void
  setMessages: Dispatch<SetStateAction<Message[]>>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  return (
    <>
      <div className="px-4 py-2.5 hairline-b text-[11px] text-mute flex items-center justify-between">
        <span>[ conversation ]</span>
        <span>{messages.length} events</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-5 dark-scroll">
        {messages.map((m) => (
          <MessageRow key={m.id} m={m} setMessages={setMessages} />
        ))}
      </div>

      <div className="hairline-t bg-canvas">
        <div className="px-3 pt-2 flex flex-wrap gap-1.5">
          {COMMAND_CHIPS.map((c) => (
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
              placeholder="Ask for a change, add a feature, or answer the agent…"
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
