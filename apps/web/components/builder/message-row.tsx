"use client"

import type { Dispatch, SetStateAction } from "react"
import { AlertTriangle, CheckCircle2 } from "lucide-react"

import type { Message } from "@/lib/types"
import { TaskCard } from "@/components/builder/task-card"
import { QuestionCard } from "@/components/builder/question-card"
import { PermissionCard } from "@/components/builder/permission-card"
import { FilesCard } from "@/components/builder/files-card"
import { RepoPushCard } from "@/components/builder/repo-push-card"
import { PrPromptCard } from "@/components/builder/pr-prompt-card"

export function MessageRow({
  m,
  setMessages,
}: {
  m: Message
  setMessages: Dispatch<SetStateAction<Message[]>>
}) {
  if (m.role === "user" && m.kind === "text") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-ink text-on-primary px-3.5 py-2.5 rounded-sm text-sm whitespace-pre-wrap">
          {m.text}
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-3">
      <div className="h-6 w-6 shrink-0 grid place-items-center bg-surface-card text-ink rounded-sm text-[10px] font-bold mt-0.5">
        F/
      </div>
      <div className="min-w-0 flex-1">
        {m.kind === "text" && <p className="text-sm text-body whitespace-pre-wrap">{m.text}</p>}

        {m.kind === "task" && <TaskCard m={m} />}

        {m.kind === "question" && (
          <QuestionCard
            m={m}
            onAnswer={(opt) =>
              setMessages((prev) => [
                ...prev,
                { id: `${m.id}-ans`, role: "user", kind: "text", text: opt, timestamp: new Date().toISOString() },
                { id: `${m.id}-ack`, role: "agent", kind: "text", text: `Great — going ${opt.toLowerCase()}.`, timestamp: new Date().toISOString() },
              ])
            }
          />
        )}

        {m.kind === "permission" && <PermissionCard m={m} />}
        {m.kind === "files" && <FilesCard m={m} />}
        {m.kind === "repo-push" && <RepoPushCard m={m} />}
        {m.kind === "pr-prompt" && <PrPromptCard m={m} />}
        {m.kind === "warning" && (
          <div className="border border-warning/50 bg-warning/10 px-3 py-2 rounded-sm text-sm text-ink flex gap-2 items-start">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <span>{m.text}</span>
          </div>
        )}
        {m.kind === "success" && (
          <div className="border border-success/50 bg-success/10 px-3 py-2 rounded-sm text-sm text-ink flex gap-2 items-start">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
            <span>{m.text}</span>
          </div>
        )}
      </div>
    </div>
  )
}
