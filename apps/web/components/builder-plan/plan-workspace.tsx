"use client"

import { useEffect, useMemo, useState } from "react"
import { Play } from "lucide-react"

import type { Project, RepoRef } from "@/lib/types"
import { SESSION_KEYS, projectNameFromPrompt, readSessionSource, readSessionWorkspaceId } from "@/lib/builder-data"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { WorkspaceHeader } from "@/components/workspace/workspace-header"
import { MobileViewSwitch } from "@/components/workspace/mobile-view-switch"
import { ConversationPanel, type PlanMsg } from "@/components/builder-plan/conversation-panel"
import { PlanTabs } from "@/components/builder-plan/plan-tabs"
import type { PlanTab } from "@/components/builder-plan/plan-tabs-config"

const now = () => new Date().toISOString()
const DEFAULT_PROMPT = ""

export function PlanWorkspace({
  projectId,
  project,
  onApproveBuild,
}: {
  projectId: string
  project: Project | null
  onApproveBuild: () => void
}) {
  const [prompt, setPrompt] = useState(project?.initialPrompt ?? DEFAULT_PROMPT)
  const [composer, setComposer] = useState("")
  const [tab, setTab] = useState<PlanTab>("overview")
  const [mobileView, setMobileView] = useState<"chat" | "work">("work")
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [messages, setMessages] = useState<PlanMsg[]>([])
  const [repo, setRepo] = useState<RepoRef | null>(project?.repo ?? null)
  const [workspaceId, setWorkspaceId] = useState(project?.workspaceId ?? "")

  useEffect(() => {
    const seed = project?.initialPrompt ?? sessionStorage.getItem(SESSION_KEYS.prompt) ?? DEFAULT_PROMPT
    const boot = project ? null : readSessionSource()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap from sessionStorage, which isn't readable during SSR/first render.
    if (!project) setPrompt(seed)
    if (boot) setRepo(boot.repo)
    if (!project) setWorkspaceId(readSessionWorkspaceId() ?? "")
    setMessages(seed ? [{ id: "p0", role: "user", text: seed, ts: now() }] : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const projectName = useMemo(() => project?.name ?? projectNameFromPrompt(prompt), [project, prompt])

  const workspaces = useWorkspaces()
  const workspaceName = useMemo(
    () => workspaces.find((w) => w.id === workspaceId)?.name,
    [workspaces, workspaceId]
  )

  const send = (text?: string) => {
    const t = (text ?? composer).trim()
    if (!t) return
    const id = String(Date.now())
    setMessages((p) => [...p, { id, role: "user", text: t, ts: now() }])
    setComposer("")
  }

  return (
    <div className="h-screen flex flex-col bg-canvas text-ink overflow-hidden">
      <WorkspaceHeader
        projectName={projectName}
        workspaceName={workspaceName}
        repo={repo}
        statusPill={
          <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-surface-soft text-body border border-hairline flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-ink" /> Planning
          </span>
        }
        primaryAction={
          <button
            onClick={onApproveBuild}
            className="h-8 px-3 bg-ink text-on-primary text-xs rounded-sm flex items-center gap-1.5 hover:bg-ink-deep"
          >
            <Play className="h-3.5 w-3.5" /> Approve & build
          </button>
        }
      />

      <MobileViewSwitch view={mobileView} onChange={setMobileView} workLabel="Plan" />

      <div className="flex-1 flex min-h-0">
        <section
          className={`${mobileView === "chat" ? "flex" : "hidden"} ${chatCollapsed ? "md:hidden" : "md:flex"} flex-col w-full md:w-[420px] lg:w-[460px] shrink-0 md:hairline-r min-w-0`}
        >
          <ConversationPanel messages={messages} composer={composer} setComposer={setComposer} send={send} />
        </section>

        <section className={`${mobileView === "work" ? "flex" : "hidden"} md:flex flex-col flex-1 min-w-0 bg-surface-soft`}>
          <PlanTabs
            tab={tab}
            setTab={setTab}
            prompt={prompt}
            chatCollapsed={chatCollapsed}
            onToggleChat={() => setChatCollapsed((v) => !v)}
          />
        </section>
      </div>
    </div>
  )
}
