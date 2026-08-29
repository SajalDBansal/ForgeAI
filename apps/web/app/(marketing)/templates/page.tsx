import type { Metadata } from "next"

import { TemplatesView } from "@/components/templates/templates-view"

export const metadata: Metadata = { title: "Templates — ForgeAI" }

export default function TemplatesPage() {
  return <TemplatesView />
}
