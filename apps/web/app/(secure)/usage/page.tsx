import type { Metadata } from "next"

import { PageShell } from "@/components/layout/page-shell"
import { UsageTabs } from "@/components/usage/usage-tabs"

export const metadata: Metadata = { title: "Usage & history — ForgeAI" }

// Usage & history page.
// Hosts the usage tabs.
export default function UsagePage() {
  return (
    <PageShell breadcrumbs={[{ label: "usage" }]}>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <UsageTabs />
      </div>
    </PageShell>
  )
}
