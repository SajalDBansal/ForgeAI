"use client"

import { AlertTriangle, CheckCircle2 } from "lucide-react"

import type { Message } from "@/lib/types"
import { TaskCard } from "@/components/builder/task-card"
import { QuestionCard } from "@/components/builder/question-card"
import { PermissionCard } from "@/components/builder/permission-card"
import { FilesCard } from "@/components/builder/files-card"
import { RepoPushCard } from "@/components/builder/repo-push-card"
import { PrPromptCard } from "@/components/builder/pr-prompt-card"

// Returns the display name of a message's sender.
// Agent, ForgeAI (system) or the user's name.
function senderOf(m: Message): string {
  if (m.role === "agent") return "Agent"
  if (m.role === "system") return "ForgeAI"
  return m.author?.name || "Unknown user"
}

// Renders "<sender> · <date> · <time>" under a message.
// Shared by every message kind.
function MessageMeta({ m }: { m: Message }) {
  const at = new Date(m.timestamp)
  const date = at.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const time = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  return (
    <div className="text-mute mt-1 text-[10px] leading-tight">
      <span className="text-body">{senderOf(m)}</span> · {date} · {time}
    </div>
  )
}

// Renders one agent-chat message: a user bubble, plain text, or the right card for its kind.
// Question answers are passed back through `onAnswer`.
export function MessageRow({
  m,
  onAnswer,
}: {
  m: Message
  onAnswer: (option: string) => void
}) {
  if (m.role === "user" && m.kind === "text") {
    return (
      <div className="flex flex-col items-end">
        <div className="bg-ink text-on-primary max-w-[85%] rounded-sm px-3.5 py-2.5 text-sm whitespace-pre-wrap">
          {m.text}
        </div>
        <MessageMeta m={m} />
      </div>
    )
  }
  return (
    <div className="flex gap-3">
      <div className="bg-surface-card text-ink mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-sm text-[10px] font-bold">
        F/
      </div>
      <div className="min-w-0 flex-1">
        {m.kind === "text" && (
          <p className="text-body text-sm whitespace-pre-wrap">{m.text}</p>
        )}
        {m.kind === "task" && <TaskCard m={m} />}
        {m.kind === "question" && <QuestionCard m={m} onAnswer={onAnswer} />}
        {m.kind === "permission" && <PermissionCard m={m} />}
        {m.kind === "files" && <FilesCard m={m} />}
        {m.kind === "repo-push" && <RepoPushCard m={m} />}
        {m.kind === "pr-prompt" && <PrPromptCard m={m} />}
        {m.kind === "warning" && (
          <div className="border-warning/50 bg-warning/10 text-ink flex items-start gap-2 rounded-sm border px-3 py-2 text-sm">
            <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" />
            <span>{m.text}</span>
          </div>
        )}
        {m.kind === "success" && (
          <div className="border-success/50 bg-success/10 text-ink flex items-start gap-2 rounded-sm border px-3 py-2 text-sm">
            <CheckCircle2 className="text-success mt-0.5 h-4 w-4 shrink-0" />
            <span>{m.text}</span>
          </div>
        )}
        <MessageMeta m={m} />
      </div>
    </div>
  )
}
