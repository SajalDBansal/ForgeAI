"use client"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@forgeAI/ui/components/tabs"

import { CollapseToggle } from "@/components/workspace/collapse-toggle"
import {
  PLAN_TABS,
  type PlanTab,
} from "@/components/builder-plan/plan-tabs-config"
import { Overview } from "@/components/builder-plan/sections/overview"
import { MVP } from "@/components/builder-plan/sections/mvp"
import { Stack } from "@/components/builder-plan/sections/stack"
import { Schema } from "@/components/builder-plan/sections/schema"
import { Tasks } from "@/components/builder-plan/sections/tasks"
import { Roadmap } from "@/components/builder-plan/sections/roadmap"
import { Diagrams } from "@/components/builder-plan/sections/diagrams"
import { Risks } from "@/components/builder-plan/sections/risks"
import { Metrics } from "@/components/builder-plan/sections/metrics"

// Tab bar and panels for the plan sections (overview, MVP, stack, schema…).
// Includes the toggle that hides the planning chat.
export function PlanTabs({
  tab,
  setTab,
  chatCollapsed,
  onToggleChat,
}: {
  tab: PlanTab
  setTab: (t: PlanTab) => void
  chatCollapsed: boolean
  onToggleChat: () => void
}) {
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as PlanTab)}
      className="min-h-0 flex-1 gap-0"
    >
      <TabsList className="bg-canvas hairline-b no-scrollbar h-11 w-full shrink-0 justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-none p-0 px-3">
        <CollapseToggle collapsed={chatCollapsed} onToggle={onToggleChat} />
        {PLAN_TABS.map((t) => (
          <TabsTrigger
            key={t.id}
            value={t.id}
            className="text-mute data-[state=active]:border-ink data-[state=active]:text-ink h-full flex-none gap-1.5 rounded-none border-0 border-b-2 border-transparent px-3 text-xs font-normal whitespace-nowrap shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            {t.icon}
            {t.label}
          </TabsTrigger>
        ))}
        <div className="text-mute ml-auto hidden pr-1 text-[11px] sm:block">
          [ plan draft ]
        </div>
      </TabsList>

      <div className="dark-scroll flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-5 md:p-8">
          <TabsContent value="overview">
            <Overview />
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
