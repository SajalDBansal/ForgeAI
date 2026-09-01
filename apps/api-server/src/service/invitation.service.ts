import { randomBytes } from "node:crypto"

import { prisma } from "@forgeAI/database"
import { CollaboratorRole, InvitationPreview, WorkspaceInvitation } from "@forgeAI/shared"
import { sendWorkspaceInvitationEmail } from "../lib/email.js"
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

export async function trySendInviteEmail(send: () => Promise<void>): Promise<boolean> {
    try {
        await send()
        return true
    } catch {
        return false
    }
}

async function expireStaleInvitations(workspaceId?: string): Promise<void> {
    await prisma.invitation.updateMany({
        where: { ...(workspaceId ? { workspaceId } : {}), status: "PENDING", expiresAt: { lte: new Date() } },
        data: { status: "EXPIRED" },
    })
}

function newInvitationToken(): string {
    return randomBytes(32).toString("hex")
}

function invitationExpiry(): Date {
    return new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000)
}

export async function createOrRefreshInvitation(
    invitedByUserId: string,
    workspaceId: string,
    workspaceName: string,
    invitedByName: string,
    email: string,
    role: CollaboratorRole,
): Promise<{ invitation: WorkspaceInvitation; emailSent: boolean }> {
    const token = newInvitationToken()
    const invitation = await prisma.invitation.upsert({
        where: { workspaceId_email: { workspaceId, email } },
        create: { workspaceId, email, role, invitedByUserId, token, expiresAt: invitationExpiry() },
        update: { role, invitedByUserId, token, expiresAt: invitationExpiry(), status: "PENDING", acceptedAt: null },
        select: invitationSelect,
    })
    const emailSent = await trySendInviteEmail(() =>
        sendWorkspaceInvitationEmail({ to: email, workspaceName, invitedByName, token }),
    )
    return { invitation, emailSent }
}

export type InvitationListResult =
    | { ok: true; invitations: WorkspaceInvitation[] }
    | { ok: false; reason: "workspace_not_found" }

export async function listWorkspaceInvitations(userId: string, workspaceId: string): Promise<InvitationListResult> {
    const workspace = await findOwnedWorkspace(userId, workspaceId)
    if (!workspace) return { ok: false, reason: "workspace_not_found" }

    await expireStaleInvitations(workspaceId)
    const invitations = await prisma.invitation.findMany({
        where: { workspaceId },
        select: invitationSelect,
        orderBy: { createdAt: "desc" },
    })
    return { ok: true, invitations }
}

export type InvitationMutationResult =
    | { ok: true; invitation: WorkspaceInvitation; emailSent: boolean }
    | { ok: false; reason: "workspace_not_found" | "invitation_not_found" | "not_pending" }

export async function revokeInvitation(userId: string, workspaceId: string, invitationId: string): Promise<InvitationMutationResult> {
    const workspace = await findOwnedWorkspace(userId, workspaceId)
    if (!workspace) return { ok: false, reason: "workspace_not_found" }

    await expireStaleInvitations(workspaceId)
    const existing = await prisma.invitation.findFirst({
        where: { id: invitationId, workspaceId },
        select: { id: true, status: true },
    })
    if (!existing) return { ok: false, reason: "invitation_not_found" }
    if (existing.status === "ACCEPTED") return { ok: false, reason: "not_pending" }

    const invitation = await prisma.invitation.update({
        where: { id: invitationId },
        data: { status: "REVOKED" },
        select: invitationSelect,
    })
    return { ok: true, invitation, emailSent: false }
}

export async function resendInvitation(userId: string, workspaceId: string, invitationId: string): Promise<InvitationMutationResult> {
    const workspace = await findOwnedWorkspace(userId, workspaceId)
    if (!workspace) return { ok: false, reason: "workspace_not_found" }

    const existing = await prisma.invitation.findFirst({
        where: { id: invitationId, workspaceId },
        select: { email: true, role: true, status: true },
    })
    if (!existing) return { ok: false, reason: "invitation_not_found" }
    if (existing.status === "ACCEPTED") return { ok: false, reason: "not_pending" }

    const inviter = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    const { invitation, emailSent } = await createOrRefreshInvitation(
        userId,
        workspaceId,
        workspace.name,
        inviter?.name ?? "A ForgeAI user",
        existing.email,
        existing.role,
    )
    return { ok: true, invitation, emailSent }
}

export type InvitationPreviewResult =
    | { ok: true; preview: InvitationPreview }
    | { ok: false; reason: "not_found" | "not_pending" }

export async function getInvitationPreview(token: string): Promise<InvitationPreviewResult> {
    const invitation = await prisma.invitation.findUnique({
        where: { token },
        select: {
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

export async function acceptInvitation(user: { id: string; email: string }, token: string): Promise<AcceptInvitationResult> {
    const invitation = await prisma.invitation.findUnique({
        where: { token },
        select: { id: true, email: true, role: true, status: true, expiresAt: true, workspaceId: true },
    })
    if (!invitation) return { ok: false, reason: "not_found" }
    if (invitation.status !== "PENDING" || invitation.expiresAt <= new Date()) {
        return { ok: false, reason: "not_pending" }
    }
    if (invitation.email !== user.email) return { ok: false, reason: "email_mismatch" }

    await prisma.$transaction([
        prisma.collaborator.createMany({
            data: [{ workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role }],
            skipDuplicates: true,
        }),
        prisma.invitation.update({
            where: { id: invitation.id },
            data: { status: "ACCEPTED", acceptedAt: new Date() },
        }),
    ])
    return { ok: true, workspaceId: invitation.workspaceId }
}

export async function redeemPendingInvitations(user: { id: string; email: string }): Promise<void> {
    const now = new Date()
    const invitations = await prisma.invitation.findMany({
        where: { email: user.email, status: "PENDING", expiresAt: { gt: now } },
        select: { id: true, workspaceId: true, role: true },
    })
    if (invitations.length === 0) return

    await prisma.$transaction([
        prisma.collaborator.createMany({
            data: invitations.map((invitation) => ({
                workspaceId: invitation.workspaceId,
                userId: user.id,
                role: invitation.role,
            })),
            skipDuplicates: true,
        }),
        prisma.invitation.updateMany({
            where: { id: { in: invitations.map((invitation) => invitation.id) } },
            data: { status: "ACCEPTED", acceptedAt: now },
        }),
    ])
}
