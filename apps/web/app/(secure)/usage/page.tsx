import type { Metadata } from "next"

import { PageShell } from "@/components/layout/page-shell"
import { UsageTabs } from "@/components/usage/usage-tabs"

export const metadata: Metadata = { title: "Usage & history — ForgeAI" }

export default function UsagePage() {
  return (
    <PageShell breadcrumbs={[{ label: "usage" }]}>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <UsageTabs />
      </div>
    </PageShell>
  )
}
