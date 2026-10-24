import { prisma } from "@forgeAI/database"
import { enqueueTask, recordAudit } from "@forgeAI/jobs"
import {
  AccountCollaborator,
  CollaboratorRole,
  InviteCollaboratorDataType,
  WorkspaceCollaborator,
  WorkspaceInvitation,
} from "@forgeAI/shared"
import { createOrRefreshInvitation } from "./invitation.service.js"
import {
  collaboratorSelect,
  findOwnedWorkspace,
  workspaceAccessFilter,
  workspaceMembershipFilter,
  workspaceProjectIds,
} from "./workspace.service.js"
import { publishAccessChanged } from "../lib/project-events.js"

export type WorkspaceCollaboratorListResult =
  | { ok: true; collaborators: WorkspaceCollaborator[] }
  | { ok: false; reason: "workspace_not_found" }

// Lists a workspace's collaborators, if the user can see the workspace.
// Backs the workspace settings "People" list.
export async function listWorkspaceCollaborators(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceCollaboratorListResult> {
  const workspace = await prisma.workspace.findFirst({
    where: workspaceAccessFilter(userId, workspaceId),
  })
  if (!workspace) return { ok: false, reason: "workspace_not_found" }

  const collaborators = await prisma.collaborator.findMany({
    where: { workspaceId },
    select: collaboratorSelect,
    orderBy: { createdAt: "asc" },
  })
  return { ok: true, collaborators }
}

// Lists collaborators across every workspace the user belongs to, with workspace names.
// Returned with app metadata so the client has everyone up front.
export async function listAccountCollaborators(
  userId: string,
): Promise<AccountCollaborator[]> {
  const rows = await prisma.collaborator.findMany({
    where: { workspace: workspaceMembershipFilter(userId) },
    select: {
      ...collaboratorSelect,
      workspaceId: true,
      workspace: { select: { name: true } },
    },
    orderBy: [{ workspaceId: "asc" }, { createdAt: "asc" }],
  })

  return rows.map(({ workspace, ...row }) => ({
    ...row,
    workspaceName: workspace.name,
  }))
}

export type InviteWorkspaceCollaboratorResult =
  | {
      ok: true
      kind: "collaborator"
      collaborator: WorkspaceCollaborator
      emailQueued: boolean
    }
  | {
      ok: true
      kind: "invitation"
      invitation: WorkspaceInvitation
      emailQueued: boolean
    }
  | {
      ok: false
      reason: "workspace_not_found" | "already_collaborator" | "already_invited"
    }

type OwnedWorkspace = { id: string; name: string; userId: string }

// Adds an existing account to the workspace straight away and emails them.
// Refused when they're the owner or already a collaborator.
async function addExistingUser(
  workspace: OwnedWorkspace,
  inviteeId: string,
  input: InviteCollaboratorDataType,
  actorId: string,
): Promise<InviteWorkspaceCollaboratorResult> {
  if (inviteeId === workspace.userId)
    return { ok: false, reason: "already_collaborator" }

  const existing = await prisma.collaborator.findFirst({
    where: { workspaceId: workspace.id, userId: inviteeId },
    select: { id: true },
  })
  if (existing) return { ok: false, reason: "already_collaborator" }

  const collaborator = await prisma.$transaction(async (tx) => {
    const row = await tx.collaborator.create({
      data: { workspaceId: workspace.id, userId: inviteeId, role: input.role },
      select: collaboratorSelect,
    })
    await enqueueTask(tx, {
      type: "email.access",
      collaboratorId: row.id,
      actorId,
    })
    await recordAudit(tx, {
      action: "collaborator.added",
      actorId,
      workspaceId: workspace.id,
      targetId: inviteeId,
      role: input.role,
    })
    return row
  })
  return { ok: true, kind: "collaborator", collaborator, emailQueued: true }
}

// Adds an existing user directly, or emails a sign-up invitation to a new address.
// Owner only; refuses duplicates and live pending invitations.
export async function inviteWorkspaceCollaborator(
  userId: string,
  workspaceId: string,
  input: InviteCollaboratorDataType,
): Promise<InviteWorkspaceCollaboratorResult> {
  const workspace = await findOwnedWorkspace(userId, workspaceId)
  if (!workspace) return { ok: false, reason: "workspace_not_found" }

  const invitee = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  })

  if (invitee) return addExistingUser(workspace, invitee.id, input, userId)

  const pending = await prisma.invitation.findUnique({
    where: { workspaceId_email: { workspaceId, email: input.email } },
    select: { status: true, expiresAt: true },
  })
  if (pending?.status === "PENDING" && pending.expiresAt > new Date()) {
    return { ok: false, reason: "already_invited" }
  }

  const { invitation, emailQueued } = await createOrRefreshInvitation(
    userId,
    workspaceId,
    input.email,
    input.role,
  )
  return { ok: true, kind: "invitation", invitation, emailQueued }
}

export type WorkspaceCollaboratorMutationResult =
  | { ok: true; collaborator: WorkspaceCollaborator }
  | {
      ok: false
      reason:
        "workspace_not_found" | "collaborator_not_found" | "owner_cannot_leave"
    }

// Finds a collaborator row for a user in a workspace.
// Used before changing a role or removing someone.
async function findWorkspaceCollaborator(
  workspaceId: string,
  collaboratorUserId: string,
) {
  return prisma.collaborator.findFirst({
    where: { workspaceId, userId: collaboratorUserId },
    select: { id: true },
  })
}

// Changes a collaborator's role and reconnects their open tabs with the new access.
// Owner only.
export async function updateWorkspaceCollaboratorRole(
  userId: string,
  workspaceId: string,
  collaboratorUserId: string,
  role: CollaboratorRole,
): Promise<WorkspaceCollaboratorMutationResult> {
  const workspace = await findOwnedWorkspace(userId, workspaceId)
  if (!workspace) return { ok: false, reason: "workspace_not_found" }

  const existing = await findWorkspaceCollaborator(
    workspaceId,
    collaboratorUserId,
  )
  if (!existing) return { ok: false, reason: "collaborator_not_found" }

  const collaborator = await prisma.$transaction(async (tx) => {
    const row = await tx.collaborator.update({
      where: { id: existing.id },
      data: { role },
      select: collaboratorSelect,
    })
    await recordAudit(tx, {
      action: "collaborator.role_changed",
      actorId: userId,
      workspaceId,
      targetId: collaboratorUserId,
      role,
    })
    return row
  })
  // Their tabs reconnect now with a ticket carrying the new role.
  await publishAccessChanged(
    await workspaceProjectIds(workspaceId),
    collaboratorUserId,
  )
  return { ok: true, collaborator }
}

// Removes a collaborator: the owner may remove anyone, a collaborator may remove only themselves.
// Anyone else gets `workspace_not_found`; the owner can't leave their own workspace.
export async function removeWorkspaceCollaborator(
  userId: string,
  workspaceId: string,
  collaboratorUserId: string,
): Promise<WorkspaceCollaboratorMutationResult> {
  const leaving = userId === collaboratorUserId

  const workspace = leaving
    ? await prisma.workspace.findFirst({
        where: workspaceAccessFilter(userId, workspaceId),
      })
    : await findOwnedWorkspace(userId, workspaceId)
  if (!workspace) return { ok: false, reason: "workspace_not_found" }

  if (leaving && workspace.userId === userId)
    return { ok: false, reason: "owner_cannot_leave" }

  const existing = await findWorkspaceCollaborator(
    workspaceId,
    collaboratorUserId,
  )
  if (!existing) return { ok: false, reason: "collaborator_not_found" }

  const collaborator = await prisma.$transaction(async (tx) => {
    const row = await tx.collaborator.delete({
      where: { id: existing.id },
      select: collaboratorSelect,
    })
    await recordAudit(tx, {
      action: "collaborator.removed",
      actorId: userId,
      workspaceId,
      targetId: collaboratorUserId,
    })
    return row
  })
  // Removed or left: their open tabs are disconnected and refused a new ticket.
  await publishAccessChanged(
    await workspaceProjectIds(workspaceId),
    collaboratorUserId,
  )
  return { ok: true, collaborator }
}
