import type { Metadata } from "next"

import { TemplatesView } from "@/components/templates/templates-view"

export const metadata: Metadata = { title: "Templates — ForgeAI" }

// Template gallery page.
// Browse templates to start a project from.
export default function TemplatesPage() {
  return <TemplatesView />
}
