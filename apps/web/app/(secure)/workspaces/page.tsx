import type { Metadata } from "next"

import { WorkspacesView } from "@/components/workspaces/workspaces-view"

export const metadata: Metadata = { title: "Workspaces — ForgeAI" }

// Workspaces list page.
// Create or open a workspace.
export default function WorkspacesPage() {
  return <WorkspacesView />
}
