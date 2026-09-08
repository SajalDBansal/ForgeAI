import type { Metadata } from "next"

import { PageShell } from "@/components/layout/page-shell"
import { PlanView } from "@/components/plan/plan-view"

export const metadata: Metadata = { title: "Plan & workspace — ForgeAI" }

// Plan & workspace page.
// Shows the current plan.
export default function PlanPage() {
  return (
    <PageShell breadcrumbs={[{ label: "plan" }]}>
      <PlanView />
    </PageShell>
  )
}
