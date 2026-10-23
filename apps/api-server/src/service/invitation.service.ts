import { createHash, randomBytes } from "node:crypto"

import { prisma } from "@forgeAI/database"
import { enqueueTask, recordAudit } from "@forgeAI/jobs"
import {
  CollaboratorRole,
  InvitationPreview,
  WorkspaceInvitation,
} from "@forgeAI/shared"
import { findOwnedWorkspace } from "./workspace.service.js"

const INVITATION_TTL_DAYS = 7

export const invitationSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  workspaceId: true,
  invitedByUserId: true,
  expiresAt: true,
  createdAt: true,
} as const

// Generates a random invitation token for the email link.
// 32 random bytes, hex-encoded.
function newInvitationToken(): string {
  return randomBytes(32).toString("hex")
}

// Returns when a new or refreshed invitation expires.
// INVITATION_TTL_DAYS from now.
function invitationExpiry(): Date {
  return new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000)
}

// Creates or refreshes an invitation and durably queues its email in the same transaction.
// Used for first invites and resends alike.
export async function createOrRefreshInvitation(
  invitedByUserId: string,
  workspaceId: string,
  email: string,
  role: CollaboratorRole,
): Promise<{ invitation: WorkspaceInvitation; emailQueued: boolean }> {
  const token = newInvitationToken()
  const invitation = await prisma.$transaction(async (tx) => {
    const row = await tx.invitation.upsert({
      where: { workspaceId_email: { workspaceId, email } },
      create: {
        workspaceId,
        email,
        role,
        invitedByUserId,
        token,
        expiresAt: invitationExpiry(),
      },
      update: {
        role,
        invitedByUserId,
        token,
        expiresAt: invitationExpiry(),
        status: "PENDING",
        acceptedAt: null,
      },
      select: invitationSelect,
    })
    await enqueueTask(tx, {
      type: "email.invitation",
      invitationId: row.id,
      tokenVersion: createHash("sha256").update(token).digest("hex"),
    })
    await recordAudit(tx, {
      action: "invitation.created",
      actorId: invitedByUserId,
      workspaceId,
      targetId: row.id,
      role,
    })
    return row
  })
  return { invitation, emailQueued: true }
}

export type InvitationListResult =
  | { ok: true; invitations: WorkspaceInvitation[] }
  | { ok: false; reason: "workspace_not_found" }

// Lists a workspace's invitations, newest first.
// Owner only.
export async function listWorkspaceInvitations(
  userId: string,
  workspaceId: string,
): Promise<InvitationListResult> {
  const workspace = await findOwnedWorkspace(userId, workspaceId)
  if (!workspace) return { ok: false, reason: "workspace_not_found" }

  const invitations = await prisma.invitation.findMany({
    where: { workspaceId },
    select: invitationSelect,
    orderBy: { createdAt: "desc" },
  })
  // Expiry is effective immediately; the cleanup worker persists the label later.
  const now = new Date()
  return {
    ok: true,
    invitations: invitations.map((invitation) =>
      invitation.status === "PENDING" && invitation.expiresAt <= now
        ? { ...invitation, status: "EXPIRED" as const }
        : invitation,
    ),
  }
}

export type InvitationMutationResult =
  | { ok: true; invitation: WorkspaceInvitation; emailQueued: boolean }
  | {
      ok: false
      reason: "workspace_not_found" | "invitation_not_found" | "not_pending"
    }

// Revokes an invitation that hasn't been accepted.
// Owner only.
export async function revokeInvitation(
  userId: string,
  workspaceId: string,
  invitationId: string,
): Promise<InvitationMutationResult> {
  const workspace = await findOwnedWorkspace(userId, workspaceId)
  if (!workspace) return { ok: false, reason: "workspace_not_found" }

  return prisma.$transaction(async (tx): Promise<InvitationMutationResult> => {
    // Acceptance and revocation serialize on the same row before checking its status.
    await tx.$queryRaw`SELECT "id" FROM "Invitation" WHERE "id" = ${invitationId} FOR UPDATE`
    const existing = await tx.invitation.findFirst({
      where: { id: invitationId, workspaceId },
      select: { id: true, status: true },
    })
    if (!existing) return { ok: false, reason: "invitation_not_found" }
    if (existing.status === "ACCEPTED")
      return { ok: false, reason: "not_pending" }
    const invitation = await tx.invitation.update({
      where: { id: invitationId },
      data: { status: "REVOKED" },
      select: invitationSelect,
    })
    await recordAudit(tx, {
      action: "invitation.revoked",
      actorId: userId,
      workspaceId,
      targetId: invitationId,
    })
    return { ok: true, invitation, emailQueued: false }
  })
}

// Re-sends an unaccepted invitation with a fresh token and expiry.
// Owner only.
export async function resendInvitation(
  userId: string,
  workspaceId: string,
  invitationId: string,
): Promise<InvitationMutationResult> {
  const workspace = await findOwnedWorkspace(userId, workspaceId)
  if (!workspace) return { ok: false, reason: "workspace_not_found" }

  const existing = await prisma.invitation.findFirst({
    where: { id: invitationId, workspaceId },
    select: { email: true, role: true, status: true },
  })
  if (!existing) return { ok: false, reason: "invitation_not_found" }
  if (existing.status === "ACCEPTED")
    return { ok: false, reason: "not_pending" }

  const { invitation, emailQueued } = await createOrRefreshInvitation(
    userId,
    workspaceId,
    existing.email,
    existing.role,
  )
  return { ok: true, invitation, emailQueued }
}

export type InvitationPreviewResult =
  | { ok: true; preview: InvitationPreview }
  | { ok: false; reason: "not_found" | "not_pending" }

// Loads the public details of a live invitation by token.
// Reports `not_pending` for used, revoked or expired invitations.
export async function getInvitationPreview(
  token: string,
): Promise<InvitationPreviewResult> {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    select: {
      email: true,
      status: true,
      role: true,
      expiresAt: true,
      workspace: { select: { name: true } },
      invitedBy: { select: { name: true } },
    },
  })
  if (!invitation) return { ok: false, reason: "not_found" }
  if (invitation.status !== "PENDING" || invitation.expiresAt <= new Date()) {
    return { ok: false, reason: "not_pending" }
  }

  return {
    ok: true,
    preview: {
      email: invitation.email,
      workspaceName: invitation.workspace.name,
      invitedByName: invitation.invitedBy.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    },
  }
}

export type AcceptInvitationResult =
  | { ok: true; workspaceId: string }
  | { ok: false; reason: "not_found" | "not_pending" | "email_mismatch" }

// Accepts an invitation for the signed-in user, if the email matches and it's still live.
// Adds the collaborator and marks the invitation accepted in one transaction.
export async function acceptInvitation(
  user: { id: string; email: string },
  token: string,
): Promise<AcceptInvitationResult> {
  return prisma.$transaction(async (tx): Promise<AcceptInvitationResult> => {
    // Re-check the token after the lock so a revoke or resend cannot grant stale access.
    await tx.$queryRaw`SELECT "id" FROM "Invitation" WHERE "token" = ${token} FOR UPDATE`
    const invitation = await tx.invitation.findUnique({
      where: { token },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        workspaceId: true,
      },
    })
    if (!invitation) return { ok: false, reason: "not_found" }
    if (invitation.email !== user.email)
      return { ok: false, reason: "email_mismatch" }

    if (
      invitation.status === "ACCEPTED" &&
      (await tx.collaborator.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId: user.id,
          },
        },
      }))
    ) {
      return { ok: true, workspaceId: invitation.workspaceId }
    }

    if (invitation.status !== "PENDING" || invitation.expiresAt <= new Date()) {
      return { ok: false, reason: "not_pending" }
    }

    await tx.collaborator.createMany({
      data: [
        {
          workspaceId: invitation.workspaceId,
          userId: user.id,
          role: invitation.role,
        },
      ],
      skipDuplicates: true,
    })
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    })
    await recordAudit(tx, {
      action: "invitation.accepted",
      actorId: user.id,
      workspaceId: invitation.workspaceId,
      targetId: invitation.id,
      role: invitation.role,
    })
    return { ok: true, workspaceId: invitation.workspaceId }
  })
}

// Turns every live invitation for this email into collaborator access.
// Called when a user signs up verified or verifies their email.
export async function redeemPendingInvitations(user: {
  id: string
  email: string
}): Promise<void> {
  const now = new Date()
  const invitations = await prisma.invitation.findMany({
    where: { email: user.email, status: "PENDING", expiresAt: { gt: now } },
    select: { token: true },
  })
  if (invitations.length === 0) return

  // Reuse the locked redemption path rather than trusting this earlier list of pending rows.
  for (const invitation of invitations)
    await acceptInvitation(user, invitation.token)
}
