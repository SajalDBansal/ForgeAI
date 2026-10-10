import type { Metadata } from "next"

import { ProjectWorkspace } from "@/components/workspace/project-workspace"

export const metadata: Metadata = {
  title: "Workspace · ForgeAI",
  description:
    "The ForgeAI workspace: conversation, code, preview, and plan panels.",
}

// Opens the builder workspace for a project.
// The main editing screen.
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <ProjectWorkspace projectId={projectId} />
}
