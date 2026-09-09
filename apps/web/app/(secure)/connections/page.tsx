import type { Metadata } from "next"

import { PageShell } from "@/components/layout/page-shell"
import { ConnectionsView } from "@/components/connections/connections-view"

export const metadata: Metadata = { title: "Connections — ForgeAI" }

// List of third-party connections (GitHub, Vercel, ...).
// Entry point to connect or manage a provider.
export default function ConnectionsPage() {
  return (
    <PageShell breadcrumbs={[{ label: "connections" }]}>
      <ConnectionsView />
    </PageShell>
  )
}
