import type { Metadata } from "next"

import { WorkspaceDetailView } from "@/components/workspaces/workspace-detail-view"

export const metadata: Metadata = { title: "Workspace — ForgeAI" }

export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <WorkspaceDetailView workspaceId={id} />
}
