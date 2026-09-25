import type { Metadata } from "next"

import { ProjectsView } from "@/components/projects/projects-view"

export const metadata: Metadata = { title: "Projects — ForgeAI" }

// All projects page.
// Search, filter and open projects.
export default function ProjectsPage() {
  return <ProjectsView />
}
