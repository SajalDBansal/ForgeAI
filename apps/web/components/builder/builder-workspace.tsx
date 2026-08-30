"use client"

import { useEffect, useMemo, useState } from "react"
import { Rocket } from "lucide-react"

import { PROJECT_STATUS_LABEL, type Message, type Project, type ProjectSource, type ProjectStatus, type RepoRef } from "@/lib/types"
import { SESSION_KEYS, projectNameFromPrompt, readSessionSource, readSessionWorkspaceId, repoForNewProject } from "@/lib/builder-data"
import { useAppStore } from "@/lib/store"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { WorkspaceHeader } from "@/components/workspace/workspace-header"
import { MobileViewSwitch } from "@/components/workspace/mobile-view-switch"
import { ConversationPanel } from "@/components/builder/conversation-panel"
import { WorkPanel, type WorkTab } from "@/components/builder/work-panel"
import { DeployDialog } from "@/components/deploy/deploy-dialog"

const DEFAULT_PROMPT = ""

export function BuilderWorkspace({
  projectId,
  project,
}: {
  projectId: string
  project: Project | null
}) {
  const [prompt, setPrompt] = useState(project?.initialPrompt ?? DEFAULT_PROMPT)
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "BUILDING")
  const [messages, setMessages] = useState<Message[]>([])
  const [tab, setTab] = useState<WorkTab>("preview")
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop")
  const [activeFile, setActiveFile] = useState<string>("")
  const [openFiles, setOpenFiles] = useState<string[]>([])
  const [mobileView, setMobileView] = useState<"chat" | "work">("chat")
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [composer, setComposer] = useState("")
  const [previewState, setPreviewState] = useState<"loading" | "ready">(
    project ? "ready" : "loading"
  )
  const [deployOpen, setDeployOpen] = useState(false)
  const [source, setSource] = useState<ProjectSource>(project?.source ?? "MANUAL")
  const [attachedRepo, setAttachedRepo] = useState<RepoRef | null>(project?.repo ?? null)
  const [workspaceId, setWorkspaceId] = useState(project?.workspaceId ?? "")
  const updateProject = useAppStore((s) => s.updateProject)

  useEffect(() => {
    const seed = project?.initialPrompt ?? sessionStorage.getItem(SESSION_KEYS.prompt) ?? DEFAULT_PROMPT
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap from sessionStorage, which isn't readable during SSR/first render.
    if (!project) setPrompt(seed)
    setMessages(
      seed ? [{ id: "m0", role: "user", kind: "text", text: seed, timestamp: new Date().toISOString() }] : []
    )
    if (!project) {
      const { source: bootSource, repo: bootRepo } = readSessionSource()
      setSource(bootSource)
      setAttachedRepo(bootRepo)
      setWorkspaceId(readSessionWorkspaceId() ?? "")
      setPreviewState("ready")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const projectName = useMemo(() => project?.name ?? projectNameFromPrompt(prompt), [project, prompt])

  const workspaces = useWorkspaces()
  const workspaceName = useMemo(
    () => workspaces.find((w) => w.id === workspaceId)?.name,
    [workspaces, workspaceId]
  )

  const repo = useMemo<RepoRef | null>(() => {
    if (source === "GITHUB") return attachedRepo
    return attachedRepo ?? repoForNewProject(projectName)
  }, [source, attachedRepo, projectName])

  const send = (text?: string) => {
    const t = (text ?? composer).trim()
    if (!t) return
    const id = String(Date.now())
    setMessages((prev) => [
      ...prev,
      { id, role: "user", kind: "text", text: t, timestamp: new Date().toISOString() },
    ])
    setComposer("")
    setStatus("BUILDING")
    if (project) updateProject(project.id, { status: "BUILDING", updatedAt: new Date().toISOString() })
  }

  return (
    <div className="h-screen flex flex-col bg-canvas text-ink overflow-hidden">
      <WorkspaceHeader
        projectName={projectName}
        workspaceName={workspaceName}
        repo={repo}
        showContext
        statusPill={
          <span className={`text-[10px] px-1.5 py-0.5 rounded-sm flex items-center gap-1.5 ${statusTone(status)}`}>
            {status === "BUILDING" && <span className="h-1.5 w-1.5 rounded-full bg-warning pulse-dot" />}
            {status === "READY" && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
            {status === "NEEDS_INPUT" && <span className="h-1.5 w-1.5 rounded-full bg-warning" />}
            {PROJECT_STATUS_LABEL[status]}
          </span>
        }
        primaryAction={
          <button
            onClick={() => setDeployOpen(true)}
            className="h-8 px-3 bg-ink text-on-primary text-xs rounded-sm flex items-center gap-1.5 hover:bg-ink-deep"
          >
            <Rocket className="h-3.5 w-3.5" /> Deploy
          </button>
        }
      />

      <MobileViewSwitch view={mobileView} onChange={setMobileView} workLabel="Workspace" />

      <div className="flex-1 flex min-h-0">
        <section
          className={`${mobileView === "chat" ? "flex" : "hidden"} ${chatCollapsed ? "md:hidden" : "md:flex"} flex-col w-full md:w-[420px] lg:w-[480px] shrink-0 md:hairline-r min-w-0`}
        >
          <ConversationPanel messages={messages} composer={composer} setComposer={setComposer} send={send} setMessages={setMessages} />
        </section>

        <section className={`${mobileView === "work" ? "flex" : "hidden"} md:flex flex-col flex-1 min-w-0 bg-surface-soft`}>
          <WorkPanel
            tab={tab}
            setTab={setTab}
            chatCollapsed={chatCollapsed}
            onToggleChat={() => setChatCollapsed((v) => !v)}
            device={device}
            setDevice={setDevice}
            previewState={previewState}
            setPreviewState={setPreviewState}
            activeFile={activeFile}
            setActiveFile={(f) => {
              setActiveFile(f)
              setOpenFiles((o) => (o.includes(f) ? o : [...o, f]))
            }}
            openFiles={openFiles}
            closeFile={(f) =>
              setOpenFiles((o) => {
                const next = o.filter((x) => x !== f)
                if (activeFile === f && next.length) setActiveFile(next[next.length - 1]!)
                return next
              })
            }
            prompt={prompt}
            projectName={projectName}
            status={status}
            messages={messages}
          />
        </section>
      </div>

      {deployOpen && <DeployDialog projectName={projectName} onClose={() => setDeployOpen(false)} />}
    </div>
  )
}

function statusTone(s: ProjectStatus) {
  switch (s) {
    case "READY":
      return "bg-surface-card text-ink"
    case "BUILDING":
      return "bg-ink text-on-primary"
    case "PLANNING":
      return "bg-surface-soft text-body border border-hairline"
    case "NEEDS_INPUT":
      return "bg-warning/15 text-ink border border-warning/40"
    default:
      return "bg-surface-soft text-mute"
  }
}
