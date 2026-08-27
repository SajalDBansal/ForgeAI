import { prisma } from "@forgeAI/database"
import { CollaboratorRole, InviteCollaboratorDataType, WorkspaceCollaborator, WorkspaceInvitation } from "@forgeAI/shared"
import { sendWorkspaceAccessGrantedEmail } from "../lib/email.js"
import { createOrRefreshInvitation, trySendInviteEmail } from "./invitation.service.js"
import { collaboratorSelect, findOwnedWorkspace, workspaceAccessFilter } from "./workspace.service.js"

export type WorkspaceCollaboratorListResult =
    | { ok: true; collaborators: WorkspaceCollaborator[] }
    | { ok: false; reason: "workspace_not_found" }

export async function listWorkspaceCollaborators(userId: string, workspaceId: string): Promise<WorkspaceCollaboratorListResult> {
    const workspace = await prisma.workspace.findFirst({ where: workspaceAccessFilter(userId, workspaceId) })
    if (!workspace) return { ok: false, reason: "workspace_not_found" }

    const collaborators = await prisma.collaborator.findMany({
        where: { workspaceId },
        select: collaboratorSelect,
        orderBy: { createdAt: "asc" },
    })
    return { ok: true, collaborators }
}

export type InviteWorkspaceCollaboratorResult =
    | { ok: true; kind: "collaborator"; collaborator: WorkspaceCollaborator; emailSent: boolean }
    | { ok: true; kind: "invitation"; invitation: WorkspaceInvitation; emailSent: boolean }
    | { ok: false; reason: "workspace_not_found" | "already_collaborator" | "already_invited" }

/**
 * Two branches by design: an address that already has an account becomes a
 * collaborator immediately, while an unknown address gets a pending Invitation that
 * redeemPendingInvitations turns into access the moment they sign up.
 */
export async function inviteWorkspaceCollaborator(userId: string, workspaceId: string, input: InviteCollaboratorDataType): Promise<InviteWorkspaceCollaboratorResult> {
    const workspace = await findOwnedWorkspace(userId, workspaceId)
    if (!workspace) return { ok: false, reason: "workspace_not_found" }

    const inviter = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    const invitedByName = inviter?.name ?? "A ForgeAI user"
    const invitee = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })

    if (invitee) {
        // The owner already has full access, so they can't also be a collaborator.
        if (invitee.id === workspace.userId) return { ok: false, reason: "already_collaborator" }

        const existing = await prisma.collaborator.findFirst({
            where: { workspaceId, userId: invitee.id },
            select: { id: true },
        })
        if (existing) return { ok: false, reason: "already_collaborator" }

        const collaborator = await prisma.collaborator.create({
            data: { workspaceId, userId: invitee.id, role: input.role },
            select: collaboratorSelect,
        })
        const emailSent = await trySendInviteEmail(() =>
            sendWorkspaceAccessGrantedEmail({ to: input.email, workspaceName: workspace.name, invitedByName }),
        )
        return { ok: true, kind: "collaborator", collaborator, emailSent }
    }

    const pending = await prisma.invitation.findUnique({
        where: { workspaceId_email: { workspaceId, email: input.email } },
        select: { status: true, expiresAt: true },
    })
    if (pending?.status === "PENDING" && pending.expiresAt > new Date()) {
        return { ok: false, reason: "already_invited" }
    }

    const { invitation, emailSent } = await createOrRefreshInvitation(
        userId,
        workspaceId,
        workspace.name,
        invitedByName,
        input.email,
        input.role,
    )
    return { ok: true, kind: "invitation", invitation, emailSent }
}

export type WorkspaceCollaboratorMutationResult =
    | { ok: true; collaborator: WorkspaceCollaborator }
    | { ok: false; reason: "workspace_not_found" | "collaborator_not_found" }

async function findWorkspaceCollaborator(workspaceId: string, collaboratorUserId: string) {
    return prisma.collaborator.findFirst({
        where: { workspaceId, userId: collaboratorUserId },
        select: { id: true },
    })
}

export async function updateWorkspaceCollaboratorRole(userId: string, workspaceId: string, collaboratorUserId: string, role: CollaboratorRole): Promise<WorkspaceCollaboratorMutationResult> {
    const workspace = await findOwnedWorkspace(userId, workspaceId)
    if (!workspace) return { ok: false, reason: "workspace_not_found" }

    const existing = await findWorkspaceCollaborator(workspaceId, collaboratorUserId)
    if (!existing) return { ok: false, reason: "collaborator_not_found" }

    const collaborator = await prisma.collaborator.update({
        where: { id: existing.id },
        data: { role },
        select: collaboratorSelect,
    })
    return { ok: true, collaborator }
}

export async function removeWorkspaceCollaborator(userId: string, workspaceId: string, collaboratorUserId: string): Promise<WorkspaceCollaboratorMutationResult> {
    const workspace = await findOwnedWorkspace(userId, workspaceId)
    if (!workspace) return { ok: false, reason: "workspace_not_found" }

    const existing = await findWorkspaceCollaborator(workspaceId, collaboratorUserId)
    if (!existing) return { ok: false, reason: "collaborator_not_found" }

    const collaborator = await prisma.collaborator.delete({
        where: { id: existing.id },
        select: collaboratorSelect,
    })
    return { ok: true, collaborator }
}
