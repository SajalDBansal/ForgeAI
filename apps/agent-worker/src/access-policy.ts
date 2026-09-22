export const AGENT_RUN_ACCESS_REVOKED_MESSAGE =
  "The agent stopped because the person who started it no longer has edit access to this project."

export type AgentRunAccessRole = "EDITOR" | "VIEWER"

export interface AgentRunAccessRecord {
  requestedById: string | null
  projectArchivedAt: Date | null
  workspaceArchivedAt: Date | null
  workspaceOwnerId: string
  requesterRole: AgentRunAccessRole | null
}

export function canRunAgentForProject(access: AgentRunAccessRecord): boolean {
  if (!access.requestedById) return false
  if (access.projectArchivedAt || access.workspaceArchivedAt) return false
  if (access.requestedById === access.workspaceOwnerId) return true
  return access.requesterRole === "EDITOR"
}
