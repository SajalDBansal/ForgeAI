"use client"

import { useMemo, useState } from "react"
import { Play } from "lucide-react"

import { useOpenProject } from "@/lib/project-store"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { WorkspaceHeader } from "@/components/workspace/workspace-header"
import { MobileViewSwitch } from "@/components/workspace/mobile-view-switch"
import {
  ConversationPanel,
  type PlanMsg,
} from "@/components/builder-plan/conversation-panel"
import { PlanTabs } from "@/components/builder-plan/plan-tabs"
import type { PlanTab } from "@/components/builder-plan/plan-tabs-config"

// Returns the current time as an ISO string.
// Timestamps local planning-chat messages.
const now = () => new Date().toISOString()

// Plan-mode project page: planning chat on the left, plan sections on the right.
// "Approve & build" switches the project to Build mode.
export function PlanWorkspace({
  onApproveBuild,
}: {
  onApproveBuild: () => void
}) {
  const project = useOpenProject()
  const prompt = project.initialPrompt ?? ""
  const [composer, setComposer] = useState("")
  const [tab, setTab] = useState<PlanTab>("overview")
  const [mobileView, setMobileView] = useState<"chat" | "work">("work")
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [messages, setMessages] = useState<PlanMsg[]>(() =>
    prompt ? [{ id: "p0", role: "user", text: prompt, ts: now() }] : [],
  )

  const workspaces = useWorkspaces()
  const workspaceName = useMemo(
    () => workspaces.find((w) => w.id === project.workspaceId)?.name,
    [workspaces, project.workspaceId],
  )

  const send = (text?: string) => {
    const t = (text ?? composer).trim()
    if (!t) return
    const id = String(Date.now())
    setMessages((p) => [...p, { id, role: "user", text: t, ts: now() }])
    setComposer("")
  }

  return (
    <div className="bg-canvas text-ink flex h-screen flex-col overflow-hidden">
      <WorkspaceHeader
        projectName={project.name}
        workspaceName={workspaceName}
        repo={project.repo ?? null}
        statusPill={
          <span className="bg-surface-soft text-body border-hairline flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[10px]">
            <span className="bg-ink h-1.5 w-1.5 rounded-full" /> Planning
          </span>
        }
        primaryAction={
          <button
            onClick={onApproveBuild}
            className="bg-ink text-on-primary hover:bg-ink-deep flex h-8 items-center gap-1.5 rounded-sm px-3 text-xs"
          >
            <Play className="h-3.5 w-3.5" /> Approve & build
          </button>
        }
      />

      <MobileViewSwitch
        view={mobileView}
        onChange={setMobileView}
        workLabel="Plan"
      />

      <div className="flex min-h-0 flex-1">
        <section
          className={`${mobileView === "chat" ? "flex" : "hidden"} ${chatCollapsed ? "md:hidden" : "md:flex"} md:hairline-r w-full min-w-0 shrink-0 flex-col md:w-[420px] lg:w-[460px]`}
        >
          <ConversationPanel
            messages={messages}
            composer={composer}
            setComposer={setComposer}
            send={send}
          />
        </section>

        <section
          className={`${mobileView === "work" ? "flex" : "hidden"} bg-surface-soft min-w-0 flex-1 flex-col md:flex`}
        >
          <PlanTabs
            tab={tab}
            setTab={setTab}
            chatCollapsed={chatCollapsed}
            onToggleChat={() => setChatCollapsed((v) => !v)}
          />
        </section>
      </div>
    </div>
  )
}
