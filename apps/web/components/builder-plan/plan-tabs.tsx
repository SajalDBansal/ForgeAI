"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@forgeAI/ui/components/tabs"

import { CollapseToggle } from "@/components/workspace/collapse-toggle"
import { PLAN_TABS, type PlanTab } from "@/components/builder-plan/plan-tabs-config"
import { Overview } from "@/components/builder-plan/sections/overview"
import { MVP } from "@/components/builder-plan/sections/mvp"
import { Stack } from "@/components/builder-plan/sections/stack"
import { Schema } from "@/components/builder-plan/sections/schema"
import { Tasks } from "@/components/builder-plan/sections/tasks"
import { Roadmap } from "@/components/builder-plan/sections/roadmap"
import { Diagrams } from "@/components/builder-plan/sections/diagrams"
import { Risks } from "@/components/builder-plan/sections/risks"
import { Metrics } from "@/components/builder-plan/sections/metrics"

export function PlanTabs({
  tab,
  setTab,
  prompt,
  chatCollapsed,
  onToggleChat,
}: {
  tab: PlanTab
  setTab: (t: PlanTab) => void
  prompt: string
  chatCollapsed: boolean
  onToggleChat: () => void
}) {
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as PlanTab)} className="flex-1 min-h-0 gap-0">
      <TabsList className="h-auto w-full justify-start gap-1 rounded-none bg-canvas hairline-b p-0 px-3 overflow-x-auto dark-scroll">
        <CollapseToggle collapsed={chatCollapsed} onToggle={onToggleChat} />
        {PLAN_TABS.map((t) => (
          <TabsTrigger
            key={t.id}
            value={t.id}
            className="h-10 flex-none gap-1.5 whitespace-nowrap rounded-none border-0 border-b-2 border-transparent px-3 text-xs font-normal text-mute shadow-none data-[state=active]:border-ink data-[state=active]:bg-transparent data-[state=active]:text-ink data-[state=active]:shadow-none"
          >
            {t.icon}
            {t.label}
          </TabsTrigger>
        ))}
        <div className="ml-auto text-[11px] text-mute pr-1 hidden sm:block">[ plan draft · v0.3 ]</div>
      </TabsList>

      <div className="flex-1 overflow-y-auto dark-scroll">
        <div className="max-w-3xl mx-auto p-5 md:p-8">
          <TabsContent value="overview">
            <Overview prompt={prompt} />
          </TabsContent>
          <TabsContent value="mvp">
            <MVP />
          </TabsContent>
          <TabsContent value="stack">
            <Stack />
          </TabsContent>
          <TabsContent value="schema">
            <Schema />
          </TabsContent>
          <TabsContent value="tasks">
            <Tasks />
          </TabsContent>
          <TabsContent value="roadmap">
            <Roadmap />
          </TabsContent>
          <TabsContent value="diagrams">
            <Diagrams />
          </TabsContent>
          <TabsContent value="risks">
            <Risks />
          </TabsContent>
          <TabsContent value="metrics">
            <Metrics />
          </TabsContent>
        </div>
      </div>
    </Tabs>
  )
}
