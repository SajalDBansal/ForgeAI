import type { Metadata } from "next"

import { ArchiveView } from "@/components/archive/archive-view"

export const metadata: Metadata = { title: "Archive — ForgeAI" }

// Archived projects page.
// Restore or delete projects that were archived.
export default function ArchivePage() {
  return <ArchiveView />
}
