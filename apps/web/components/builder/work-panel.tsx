"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@forgeAI/ui/components/tabs"

import type { Message } from "@/lib/types"
import { CollapseToggle } from "@/components/workspace/collapse-toggle"
import { PreviewTab } from "@/components/builder/preview/preview-tab"
import { CodeTab } from "@/components/builder/code/code-tab"
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

export function WorkPanel({
  tab,
  setTab,
  chatCollapsed,
  onToggleChat,
  device,
  setDevice,
  previewState,
  setPreviewState,
  activeFile,
  setActiveFile,
  openFiles,
  closeFile,
  prompt,
  projectName,
  status,
  messages,
}: {
  tab: WorkTab
  setTab: (t: WorkTab) => void
  chatCollapsed: boolean
  onToggleChat: () => void
  device: Device
  setDevice: (d: Device) => void
  previewState: "loading" | "ready"
  setPreviewState: (s: "loading" | "ready") => void
  activeFile: string
  setActiveFile: (f: string) => void
  openFiles: string[]
  closeFile: (f: string) => void
  prompt: string
  projectName: string
  status: string
  messages: Message[]
}) {
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as WorkTab)} className="flex-1 min-h-0 gap-0">
      <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-canvas hairline-b p-0 px-2 overflow-x-auto">
        <CollapseToggle collapsed={chatCollapsed} onToggle={onToggleChat} />
        {TABS.map((t) => (
          <TabsTrigger
            key={t.id}
            value={t.id}
            className="relative h-auto flex-none rounded-none border-0 px-3.5 py-2.5 text-sm font-normal text-mute shadow-none data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:text-ink data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:bg-ink"
          >
            {t.label}
          </TabsTrigger>
        ))}
        <div className="ml-auto text-[11px] text-mute hidden sm:flex items-center gap-2 pr-2 whitespace-nowrap">
          <span>{projectName}</span>
          <span>·</span>
          <span>{status}</span>
        </div>
      </TabsList>

      <TabsContent value="preview" className="flex min-h-0 flex-col">
        <PreviewTab device={device} setDevice={setDevice} previewState={previewState} setPreviewState={setPreviewState} projectName={projectName} />
      </TabsContent>
      <TabsContent value="code" className="flex min-h-0 flex-col">
        <CodeTab activeFile={activeFile} setActiveFile={setActiveFile} openFiles={openFiles} closeFile={closeFile} />
      </TabsContent>
      <TabsContent value="cloud" className="flex min-h-0 flex-col">
        <CloudTab />
      </TabsContent>
      <TabsContent value="history" className="flex min-h-0 flex-col">
        <HistoryTab messages={messages} />
      </TabsContent>
      <TabsContent value="info" className="flex min-h-0 flex-col">
        <InfoTab prompt={prompt} projectName={projectName} messages={messages} />
      </TabsContent>
    </Tabs>
  )
}
