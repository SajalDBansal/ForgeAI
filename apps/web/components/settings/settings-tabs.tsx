import { Tabs, TabsContent, TabsList, TabsTrigger } from "@forgeAI/ui/components/tabs"

import { ProfileTab } from "@/components/settings/profile-tab"
import { AppearanceTab } from "@/components/settings/appearance-tab"
import { AgentTab } from "@/components/settings/agent-tab"
import { NotificationsTab } from "@/components/settings/notifications-tab"
import { KeysTab } from "@/components/settings/keys-tab"

const TABS = [
  { value: "profile", label: "Profile" },
  { value: "appearance", label: "Appearance" },
  { value: "agent", label: "Agent" },
  { value: "notifications", label: "Notifications" },
  { value: "keys", label: "Keys" },
] as const

export function SettingsTabs() {
  return (
    <Tabs defaultValue="profile">
      <TabsList className="flex h-auto w-full justify-start rounded-none border-b border-hairline bg-transparent p-0 -mt-2 mb-6">
        {TABS.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="h-10 flex-none rounded-none border-b-2 border-transparent px-3 text-sm font-normal text-mute shadow-none data-[state=active]:border-ink data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:text-ink data-[state=active]:shadow-none"
          >
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="profile">
        <ProfileTab />
      </TabsContent>
      <TabsContent value="appearance">
        <AppearanceTab />
      </TabsContent>
      <TabsContent value="agent">
        <AgentTab />
      </TabsContent>
      <TabsContent value="notifications">
        <NotificationsTab />
      </TabsContent>
      <TabsContent value="keys">
        <KeysTab />
      </TabsContent>
    </Tabs>
  )
}
