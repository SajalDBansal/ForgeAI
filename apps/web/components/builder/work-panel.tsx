"use client"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@forgeAI/ui/components/tabs"

import type { PodState } from "@/hooks/use-ensure-pod"
import type { DevServer } from "@/hooks/use-dev-server"
import type { ProjectFiles } from "@/hooks/use-project-files"
import { PROJECT_STATUS_LABEL } from "@/lib/types"
import { useOpenProject } from "@/lib/project-store"
import { canContribute, useWorkspaceRole } from "@/hooks/use-workspace-role"
import { CollapseToggle } from "@/components/workspace/collapse-toggle"
import { DevServerControl } from "@/components/builder/dev-server-control"
import { PreviewTab } from "@/components/builder/preview/preview-tab"
import { CodeTab } from "@/components/builder/code/code-tab"
import type { Backup } from "@/hooks/use-snapshot-status"
import { CloudTab } from "@/components/builder/cloud/cloud-tab"
import { HistoryTab } from "@/components/builder/history/history-tab"
import { InfoTab } from "@/components/builder/info/info-tab"

export type WorkTab = "preview" | "code" | "cloud" | "history" | "info"
type Device = "desktop" | "tablet" | "mobile"

const TABS: { id: WorkTab; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "code", label: "Code" },
  { id: "cloud", label: "Cloud" },
  { id: "history", label: "History" },
  { id: "info", label: "Information" },
]

// The work area's tab bar (Preview, Code, Cloud, History, Info) and panels.
// The dev-server control sits at the end of the tab bar since it outlives any tab.
export function WorkPanel({
  tab,
  setTab,
  chatCollapsed,
  onToggleChat,
  device,
  setDevice,
  previewState,
  setPreviewState,
  pod,
  onRetryPod,
  dev,
  files,
  activeFile,
  setActiveFile,
  openFiles,
  closeFile,
  backup,
}: {
  tab: WorkTab
  setTab: (t: WorkTab) => void
  chatCollapsed: boolean
  onToggleChat: () => void
  device: Device
  setDevice: (d: Device) => void
  previewState: "loading" | "ready"
  setPreviewState: (s: "loading" | "ready") => void
  pod: PodState
  onRetryPod: () => void
  dev: DevServer
  files: ProjectFiles
  activeFile: string
  setActiveFile: (f: string) => void
  openFiles: string[]
  closeFile: (f: string) => void
  /** The save to cloud storage, shown in the Code tab's status bar. */
  backup: Backup
}) {
  const project = useOpenProject()
  const projectName = project.name
  // Computed once and passed to both the control and the Preview tab.
  const canWrite = canContribute(useWorkspaceRole(project.workspaceId))

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as WorkTab)}
      className="min-h-0 flex-1 gap-0"
    >
      <TabsList className="bg-canvas hairline-b no-scrollbar h-11 w-full shrink-0 justify-start gap-0 overflow-x-auto overflow-y-hidden rounded-none p-0 px-2">
        <CollapseToggle collapsed={chatCollapsed} onToggle={onToggleChat} />
        {TABS.map((t) => (
          <TabsTrigger
            key={t.id}
            value={t.id}
            className="text-mute data-[state=active]:text-ink data-[state=active]:after:bg-ink relative h-full flex-none rounded-none border-0 px-3.5 py-0 text-sm font-normal whitespace-nowrap shadow-none data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5"
          >
            {t.label}
          </TabsTrigger>
        ))}
        {/* Project name, status and the dev-server control. */}
        <div className="ml-auto flex items-center gap-3 pr-2">
          <span className="text-mute hidden items-center gap-2 text-[11px] whitespace-nowrap lg:flex">
            <span>{projectName}</span>
            <span>·</span>
            <span>{PROJECT_STATUS_LABEL[project.status]}</span>
          </span>
          <DevServerControl
            dev={dev}
            disabled={pod.status !== "ready"}
            canWrite={canWrite}
          />
        </div>
      </TabsList>

      <TabsContent value="preview" className="flex min-h-0 flex-col">
        <PreviewTab
          projectId={project.id}
          device={device}
          setDevice={setDevice}
          previewState={previewState}
          setPreviewState={setPreviewState}
          pod={pod}
          onRetryPod={onRetryPod}
          dev={dev}
          canWrite={canWrite}
          onOpenTerminal={() => setTab("code")}
        />
      </TabsContent>
      <TabsContent value="code" className="flex min-h-0 flex-col">
        <CodeTab
          activeFile={activeFile}
          setActiveFile={setActiveFile}
          openFiles={openFiles}
          closeFile={closeFile}
          pod={pod}
          onRetryPod={onRetryPod}
          files={files}
          projectId={project.id}
          canWrite={canWrite}
          backup={backup}
        />
      </TabsContent>
      <TabsContent value="cloud" className="flex min-h-0 flex-col">
        <CloudTab />
      </TabsContent>
      <TabsContent value="history" className="flex min-h-0 flex-col">
        <HistoryTab />
      </TabsContent>
      <TabsContent value="info" className="flex min-h-0 flex-col">
        <InfoTab />
      </TabsContent>
    </Tabs>
  )
}
