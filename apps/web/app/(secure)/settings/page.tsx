import type { Metadata } from "next"

import { PageShell } from "@/components/layout/page-shell"
import { SettingsTabs } from "@/components/settings/settings-tabs"

export const metadata: Metadata = { title: "Settings — ForgeAI" }

// Settings page.
// Hosts the account settings tabs.
export default function SettingsPage() {
  return (
    <PageShell breadcrumbs={[{ label: "settings" }]}>
      <div className="mx-auto max-w-4xl p-6">
        <SettingsTabs />
      </div>
    </PageShell>
  )
}
