import { FastifyReply, FastifyRequest } from "fastify"
import { inviteCollaboratorSchema, updateCollaboratorRoleSchema } from "@forgeAI/shared"
import { requireSession } from "../lib/session.js"
import { inviteWorkspaceCollaborator, listAccountCollaborators, listWorkspaceCollaborators, removeWorkspaceCollaborator, updateWorkspaceCollaboratorRole } from "../service/collaborator.service.js"

interface WorkspaceParams {
    id: string
}

interface WorkspaceCollaboratorParams extends WorkspaceParams {
    userId: string
}

export async function listAccountCollaboratorsHandler(request: FastifyRequest, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    return listAccountCollaborators(session.user.id)
}

export async function listWorkspaceCollaboratorsHandler(request: FastifyRequest<{ Params: WorkspaceParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const result = await listWorkspaceCollaborators(session.user.id, request.params.id)
    if (!result.ok) {
        return reply.status(404).send({ error: "Workspace not found" })
    }
    return result.collaborators
}

export async function inviteWorkspaceCollaboratorHandler(request: FastifyRequest<{ Params: WorkspaceParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const parsed = inviteCollaboratorSchema.safeParse(request.body)
    if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" })
    }

    const result = await inviteWorkspaceCollaborator(session.user.id, request.params.id, parsed.data)
    if (!result.ok) {
        if (result.reason === "workspace_not_found") {
            return reply.status(404).send({ error: "Workspace not found" })
        }
        if (result.reason === "already_invited") {
            return reply.status(409).send({ error: "That address already has a pending invitation" })
        }
        return reply.status(409).send({ error: "That person already has access to this workspace" })
    }

    if (!result.emailSent) {
        request.log.error({ workspaceId: request.params.id, kind: result.kind }, "invite email delivery failed")
    }

    return reply.status(201).send(
        result.kind === "collaborator"
            ? { kind: result.kind, collaborator: result.collaborator, emailSent: result.emailSent }
            : { kind: result.kind, invitation: result.invitation, emailSent: result.emailSent },
    )
}

export async function updateWorkspaceCollaboratorRoleHandler(request: FastifyRequest<{ Params: WorkspaceCollaboratorParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const parsed = updateCollaboratorRoleSchema.safeParse(request.body)
    if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" })
    }

    const result = await updateWorkspaceCollaboratorRole(session.user.id, request.params.id, request.params.userId, parsed.data.role)
    if (!result.ok) {
        if (result.reason === "workspace_not_found") {
            return reply.status(404).send({ error: "Workspace not found" })
        }
        return reply.status(404).send({ error: "Collaborator not found" })
    }
    return result.collaborator
}

export async function removeWorkspaceCollaboratorHandler(request: FastifyRequest<{ Params: WorkspaceCollaboratorParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const result = await removeWorkspaceCollaborator(session.user.id, request.params.id, request.params.userId)
    if (!result.ok) {
        if (result.reason === "workspace_not_found") {
            return reply.status(404).send({ error: "Workspace not found" })
        }
        return reply.status(404).send({ error: "Collaborator not found" })
    }
    return reply.status(204).send()
}
