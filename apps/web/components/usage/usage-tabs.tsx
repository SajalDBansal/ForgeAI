import { Tabs, TabsContent, TabsList, TabsTrigger } from "@forgeAI/ui/components/tabs"

import { CreditsBar } from "@/components/usage/credits-bar"
import { PlatformView } from "@/components/usage/platform-view"
import { DeployedView } from "@/components/usage/deployed-view"

const SUBTABS = [
  { value: "platform", label: "Platform usage", hint: "Your ForgeAI credits" },
  { value: "deployed", label: "Deployed apps", hint: "AI calls from your live apps" },
] as const

export function UsageTabs() {
  return (
    <div className="space-y-6">
      <CreditsBar />

      <Tabs defaultValue="platform">
        <TabsList className="flex h-auto w-full justify-start gap-1 rounded-none border-b border-hairline bg-transparent p-0">
          {SUBTABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="relative h-auto flex-none flex-col items-start gap-0 rounded-none border-0 px-4 py-2.5 text-sm font-normal text-mute shadow-none data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:text-ink data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:bg-ink"
            >
              <div>{t.label}</div>
              <div className="text-[10px] font-normal text-mute">{t.hint}</div>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="platform">
          <PlatformView />
        </TabsContent>
        <TabsContent value="deployed">
          <DeployedView />
        </TabsContent>
      </Tabs>
    </div>
  )
}
