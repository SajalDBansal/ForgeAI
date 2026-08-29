import type { Metadata } from "next"

import { PageShell } from "@/components/layout/page-shell"
import { CollaboratorsView } from "@/components/collaborators/collaborators-view"

export const metadata: Metadata = { title: "Collaborators — ForgeAI" }

export default function CollaboratorsPage() {
  return (
    <PageShell
      breadcrumbs={[{ label: "collaborators" }]}
    >
      <CollaboratorsView />
    </PageShell>
  )
}
