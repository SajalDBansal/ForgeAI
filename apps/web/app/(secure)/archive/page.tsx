import type { Metadata } from "next"

import { ArchiveView } from "@/components/archive/archive-view"

export const metadata: Metadata = { title: "Archive — ForgeAI" }

export default function ArchivePage() {
  return <ArchiveView />
}
