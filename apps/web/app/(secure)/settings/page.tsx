import type { Metadata } from "next"

import { PageShell } from "@/components/layout/page-shell"
import { SettingsTabs } from "@/components/settings/settings-tabs"

export const metadata: Metadata = { title: "Settings — ForgeAI" }

export default function SettingsPage() {
  return (
    <PageShell breadcrumbs={[{ label: "settings" }]}>
      <div className="p-6 max-w-4xl mx-auto">
        <SettingsTabs />
      </div>
    </PageShell>
  )
}
