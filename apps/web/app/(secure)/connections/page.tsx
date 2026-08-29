import type { Metadata } from "next"

import { PageShell } from "@/components/layout/page-shell"
import { ConnectionsView } from "@/components/connections/connections-view"

export const metadata: Metadata = { title: "Connections — ForgeAI" }

export default function ConnectionsPage() {
  return (
    <PageShell breadcrumbs={[{ label: "connections" }]}>
      <ConnectionsView />
    </PageShell>
  )
}
