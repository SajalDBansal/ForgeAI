import { FastifyReply, FastifyRequest } from "fastify"
import { requireSession } from "../lib/session.js"
import {
    acceptInvitation,
    getInvitationPreview,
    listWorkspaceInvitations,
    resendInvitation,
    revokeInvitation,
} from "../service/invitation.service.js"

interface WorkspaceParams {
    id: string
}

interface InvitationParams extends WorkspaceParams {
    invitationId: string
}

interface TokenParams {
    token: string
}

export async function listWorkspaceInvitationsHandler(request: FastifyRequest<{ Params: WorkspaceParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const result = await listWorkspaceInvitations(session.user.id, request.params.id)
    if (!result.ok) {
        return reply.status(404).send({ error: "Workspace not found" })
    }
    return result.invitations
}

export async function revokeInvitationHandler(request: FastifyRequest<{ Params: InvitationParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const result = await revokeInvitation(session.user.id, request.params.id, request.params.invitationId)
    if (!result.ok) {
        if (result.reason === "workspace_not_found") {
            return reply.status(404).send({ error: "Workspace not found" })
        }
        if (result.reason === "not_pending") {
            return reply.status(409).send({ error: "That invitation was already accepted — remove the collaborator instead" })
        }
        return reply.status(404).send({ error: "Invitation not found" })
    }
    return result.invitation
}

export async function resendInvitationHandler(request: FastifyRequest<{ Params: InvitationParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const result = await resendInvitation(session.user.id, request.params.id, request.params.invitationId)
    if (!result.ok) {
        if (result.reason === "workspace_not_found") {
            return reply.status(404).send({ error: "Workspace not found" })
        }
        if (result.reason === "not_pending") {
            return reply.status(409).send({ error: "That invitation was already accepted" })
        }
        return reply.status(404).send({ error: "Invitation not found" })
    }

    if (!result.emailSent) {
        request.log.error({ invitationId: request.params.invitationId }, "invite email delivery failed")
        return reply.status(502).send({ error: "We couldn't send that email — try again shortly" })
    }
    return result.invitation
}

/** Unauthenticated: this is what the emailed link opens before the invitee signs up. */
export async function getInvitationPreviewHandler(request: FastifyRequest<{ Params: TokenParams }>, reply: FastifyReply) {
    const result = await getInvitationPreview(request.params.token)
    if (!result.ok) {
        if (result.reason === "not_pending") {
            return reply.status(410).send({ error: "This invitation is no longer valid" })
        }
        return reply.status(404).send({ error: "Invitation not found" })
    }
    return result.preview
}

export async function acceptInvitationHandler(request: FastifyRequest<{ Params: TokenParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const result = await acceptInvitation(session.user, request.params.token)
    if (!result.ok) {
        if (result.reason === "not_pending") {
            return reply.status(410).send({ error: "This invitation is no longer valid" })
        }
        if (result.reason === "email_mismatch") {
            return reply.status(403).send({ error: "This invitation was sent to a different email address" })
        }
        return reply.status(404).send({ error: "Invitation not found" })
    }
    return { workspaceId: result.workspaceId }
}
