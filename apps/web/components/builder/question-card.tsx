"use client"

import { useState } from "react"
import { HelpCircle } from "lucide-react"

import type { Message } from "@/lib/types"

export function QuestionCard({ m, onAnswer }: { m: Message; onAnswer: (opt: string) => void }) {
  const [answered, setAnswered] = useState<string | null>(null)
  return (
    <div className="border border-hairline rounded-sm p-3">
      <div className="flex items-center gap-2 text-[11px] text-mute mb-1.5">
        <HelpCircle className="h-3 w-3" /> [ clarifying question ]
      </div>
      <p className="text-sm text-ink">{m.text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {m.options?.map((o) => (
          <button
            key={o}
            disabled={!!answered}
            onClick={() => {
              setAnswered(o)
              onAnswer(o)
            }}
            className={`text-xs px-3 py-1.5 rounded-sm border ${
              answered === o
                ? "bg-ink text-on-primary border-ink"
                : answered
                  ? "bg-surface-soft text-ash border-hairline"
                  : "bg-canvas border-hairline-strong text-ink hover:bg-surface-soft"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}
