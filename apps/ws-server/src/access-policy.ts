import {
  decodeProjectTicketClaims,
  verifyTicket,
  WS_PROJECT_TICKET_SCOPE,
} from "@forgeAI/shared"

export interface ProjectSocketAuthInput {
  secret: string
  projectId?: string
  ticket?: string
  currentAccessVersion: (projectId: string, userId: string) => Promise<string>
}

export type ProjectSocketAuthResult =
  | {
      ok: true
      projectId: string
      userId: string
      canWrite: boolean
    }
  | { ok: false }

export async function authenticateProjectTicket({
  secret,
  projectId,
  ticket,
  currentAccessVersion,
}: ProjectSocketAuthInput): Promise<ProjectSocketAuthResult> {
  const verified =
    ticket && projectId
      ? verifyTicket(secret, ticket, WS_PROJECT_TICKET_SCOPE)
      : null
  const claims = verified ? decodeProjectTicketClaims(verified.extra) : null

  if (!projectId || !verified || !claims || claims.projectId !== projectId)
    return { ok: false }

  const currentVersion = await currentAccessVersion(projectId, verified.subject)
  if (claims.accessVersion !== currentVersion) return { ok: false }

  return {
    ok: true,
    projectId,
    userId: verified.subject,
    canWrite: claims.canWrite,
  }
}

export interface ProjectSocketLike {
  data: {
    projectId?: string
    userId?: string
  }
  disconnect(close?: boolean): void
}

export function disconnectAffectedProjectSockets(
  sockets: Iterable<ProjectSocketLike>,
  projectId: string,
  userId: string | null,
): number {
  let disconnected = 0
  for (const socket of sockets) {
    if (socket.data.projectId !== projectId) continue
    if (userId !== null && socket.data.userId !== userId) continue
    socket.disconnect(true)
    disconnected += 1
  }
  return disconnected
}
