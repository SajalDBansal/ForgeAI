"use client"

import { useEffect, useState } from "react"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@forgeAI/ui/components/tabs"

import { CreditsBar } from "@/components/usage/credits-bar"
import { PlatformView } from "@/components/usage/platform-view"
import { DeployedView } from "@/components/usage/deployed-view"
import { getUsageSummaryRequest, type UsageSummary } from "@/lib/usage"

const SUBTABS = [
  { value: "platform", label: "Platform usage", hint: "Your ForgeAI credits" },
  {
    value: "deployed",
    label: "Deployed apps",
    hint: "AI calls from your live apps",
  },
] as const

// Credits bar plus tabs for platform and deployed-app usage.
// The body of the Usage page.
export function UsageTabs() {
  const [usage, setUsage] = useState<UsageSummary | null>(null)

  useEffect(() => {
    void getUsageSummaryRequest().then((result) => {
      if (result.ok) setUsage(result.data)
    })
  }, [])

  return (
    <div className="space-y-6">
      <CreditsBar usage={usage} />

      <Tabs defaultValue="platform">
        <TabsList className="border-hairline flex h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent p-0">
          {SUBTABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="text-mute data-[state=active]:text-ink data-[state=active]:after:bg-ink relative h-auto flex-none flex-col items-start gap-0 rounded-none border-0 px-4 py-2.5 text-sm font-normal shadow-none data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5"
            >
              <div>{t.label}</div>
              <div className="text-mute text-[10px] font-normal">{t.hint}</div>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="platform">
          <PlatformView usage={usage} />
        </TabsContent>
        <TabsContent value="deployed">
          <DeployedView />
        </TabsContent>
      </Tabs>
    </div>
  )
}
