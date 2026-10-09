"use client"

import { useMemo, useState } from "react"

import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/types"
import { useAppStore } from "@/lib/store"
import { useOpenProject, useProjectStore } from "@/lib/project-store"
import { useBuildActions } from "@/hooks/use-build-actions"
import { useDevServer } from "@/hooks/use-dev-server"
import { useEnsurePod } from "@/hooks/use-ensure-pod"
import { useOnReconnect } from "@/hooks/use-project-socket"
import { usePresence } from "@/hooks/use-presence"
import { useProjectFiles } from "@/hooks/use-project-files"
import { useSandboxLifecycle } from "@/hooks/use-sandbox-lifecycle"
import { useSnapshotStatus } from "@/hooks/use-snapshot-status"
import { canContribute, useWorkspaceRole } from "@/hooks/use-workspace-role"
import { SnapshotShrinkDialog } from "@/components/builder/snapshot-shrink-dialog"
import { SandboxNotice } from "@/components/builder/sandbox-notice"
import { GithubShift } from "@/components/builder/github-shift"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { WorkspaceHeader } from "@/components/workspace/workspace-header"
import { MobileViewSwitch } from "@/components/workspace/mobile-view-switch"
import { ChatPanel } from "@/components/builder/chat-panel"
import { WorkPanel, type WorkTab } from "@/components/builder/work-panel"

// Build-mode project page: header, sandbox banners, agent/team chat and the work tabs.
// Owns the sandbox, dev server, file tree and save status so they survive tab switches.
export function BuilderWorkspace() {
  const project = useOpenProject()
  const status = project.status
  const updateOpenProject = useProjectStore((s) => s.updateProject)
  const { sendMessage } = useBuildActions()

  const [tab, setTab] = useState<WorkTab>("preview")
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">(
    "desktop",
  )
  const [activeFile, setActiveFile] = useState<string>("")
  const [openFiles, setOpenFiles] = useState<string[]>([])
  const [mobileView, setMobileView] = useState<"chat" | "work">("chat")
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [composer, setComposer] = useState("")
  const [previewState, setPreviewState] = useState<"loading" | "ready">("ready")
  const updateProject = useAppStore((s) => s.updateProject)

  // Started client-side so the page paints at once; only Preview and Code wait on it.
  const {
    state: pod,
    retry: retryPod,
    reopen: reopenPod,
    refresh: refreshPod,
  } = useEnsurePod(project.id)

  // Idle shutdowns and orchestrator restarts; a reset re-ensures the pod.
  const lifecycle = useSandboxLifecycle(project.id, reopenPod)

  // Held here (not in the Code tab) so switching tabs doesn't re-list every folder.
  const files = useProjectFiles(project.id, pod.status === "ready")

  // Held here because the dev server outlives any one tab; seeded from the pod.
  const dev = useDevServer(
    project.id,
    pod.status === "ready" ? pod.pod.dev : undefined,
  )

  // Cloud save status; held here so its question reaches users on any tab.
  const backup = useSnapshotStatus(
    project.id,
    pod.status === "ready" ? pod.pod.snapshot : undefined,
  )

  // After a reconnect, quietly refresh the pod's seeds and re-list the file tree.
  useOnReconnect(() => {
    refreshPod()
    files.refresh()
  })
  const role = useWorkspaceRole(project.workspaceId)
  const canWrite = canContribute(role)

  // Everyone's presence, plus this tab's own heartbeat.
  const people = usePresence(project.id, tab, openFiles, activeFile)

  const workspaces = useWorkspaces()
  const workspaceName = useMemo(
    () => workspaces.find((w) => w.id === project.workspaceId)?.name,
    [workspaces, project.workspaceId],
  )

  // Sends a chat message to the agent and marks the project as building.
  // Restores the composer text if sending fails.
  const send = async (text?: string) => {
    const t = (text ?? composer).trim()
    if (!t) return
    if (text === undefined) setComposer("")
    const sent = await sendMessage(t)
    if (!sent) {
      if (text === undefined) setComposer(t)
      return
    }
    updateOpenProject({ status: "BUILDING" })
    updateProject(project.id, {
      status: "BUILDING",
      updatedAt: new Date().toISOString(),
    })
  }

  // Opens a file in the editor, adding it to the open tabs and loading its contents.
  const openFile = (f: string) => {
    setActiveFile(f)
    setOpenFiles((o) => (o.includes(f) ? o : [...o, f]))
    files.open(f)
  }

  // Opens a file the agent's knowledge search found (Q6): the Code tab, and the workspace on mobile.
  const openFromChat = (f: string) => {
    setTab("code")
    setMobileView("work")
    openFile(f)
  }

  // Closes an editor tab, switching to the last remaining tab if it was active.
  const closeFile = (f: string) =>
    setOpenFiles((o) => {
      const next = o.filter((x) => x !== f)
      if (activeFile === f && next.length) setActiveFile(next[next.length - 1]!)
      return next
    })

  return (
    <div className="bg-canvas text-ink flex h-screen flex-col overflow-hidden">
      <WorkspaceHeader
        projectName={project.name}
        workspaceName={workspaceName}
        repo={project.repo ?? null}
        statusPill={<StatusPill status={status} />}
      />

      <SandboxNotice lifecycle={lifecycle} onReopen={reopenPod} />

      {/* GitHub moved outside ForgeAI: a banner for everyone, the popup for editors. */}
      <GithubShift
        projectId={project.id}
        podReady={pod.status === "ready"}
        canWrite={canWrite}
        isOwner={role === "OWNER"}
      />

      <MobileViewSwitch
        view={mobileView}
        onChange={setMobileView}
        workLabel="Workspace"
      />

      <div className="flex min-h-0 flex-1">
        <section
          className={`${mobileView === "chat" ? "flex" : "hidden"} ${chatCollapsed ? "md:hidden" : "md:flex"} md:hairline-r w-full min-w-0 shrink-0 flex-col md:w-[420px] lg:w-[480px]`}
        >
          <ChatPanel
            composer={composer}
            setComposer={setComposer}
            send={(t) => void send(t)}
            people={people}
            onOpenFile={openFromChat}
          />
        </section>

        <section
          className={`${mobileView === "work" ? "flex" : "hidden"} bg-surface-soft min-w-0 flex-1 flex-col md:flex`}
        >
          <WorkPanel
            tab={tab}
            setTab={setTab}
            chatCollapsed={chatCollapsed}
            onToggleChat={() => setChatCollapsed((v) => !v)}
            device={device}
            setDevice={setDevice}
            previewState={previewState}
            setPreviewState={setPreviewState}
            pod={pod}
            onRetryPod={retryPod}
            dev={dev}
            files={files}
            activeFile={activeFile}
            setActiveFile={openFile}
            openFiles={openFiles}
            backup={backup}
            closeFile={closeFile}
          />
        </section>
      </div>

      <SnapshotShrinkDialog backup={backup} canWrite={canWrite} />
    </div>
  )
}

// Header pill showing the project's status with a colored dot.
// Building pulses; ready is green; needs-input is amber.
function StatusPill({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[10px] ${statusTone(status)}`}
    >
      {status === "BUILDING" && (
        <span className="bg-warning pulse-dot h-1.5 w-1.5 rounded-full" />
      )}
      {status === "READY" && (
        <span className="bg-success h-1.5 w-1.5 rounded-full" />
      )}
      {status === "NEEDS_INPUT" && (
        <span className="bg-warning h-1.5 w-1.5 rounded-full" />
      )}
      {PROJECT_STATUS_LABEL[status]}
    </span>
  )
}

// Maps a project status to the pill's color classes.
// Used by StatusPill.
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
