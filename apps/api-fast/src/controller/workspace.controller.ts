import { FastifyReply, FastifyRequest } from "fastify";
import { updateWorkspaceSchema } from "@forgeAI/shared";
import { requireSession } from "../lib/session.js";
import { archiveWorkspace, createWorkspace, deleteWorkspace, getWorkspaceDetail, updateWorkspace } from "../service/workspace.service.js";

interface CreateWorkspaceBody {
    name?: string
}

interface WorkspaceParams {
    id: string
}

export async function createWorkspaceHandler(request: FastifyRequest<{ Body: CreateWorkspaceBody }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const name = request.body?.name?.trim()
    if (!name) {
        return reply.status(400).send({ error: "name is required" })
    }

    const workspace = await createWorkspace(session.user.id, name)
    return reply.status(201).send(workspace)
}

export async function getWorkspaceHandler(request: FastifyRequest<{ Params: WorkspaceParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const result = await getWorkspaceDetail(session.user.id, request.params.id)
    if (!result.ok) {
        return reply.status(404).send({ error: "Workspace not found" })
    }
    return result.workspace
}

export async function updateWorkspaceHandler(request: FastifyRequest<{ Params: WorkspaceParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const parsed = updateWorkspaceSchema.safeParse(request.body)
    if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" })
    }

    const result = await updateWorkspace(session.user.id, request.params.id, parsed.data)
    if (!result.ok) {
        return reply.status(404).send({ error: "Workspace not found" })
    }
    return result.workspace
}

export async function archiveWorkspaceHandler(request: FastifyRequest<{ Params: WorkspaceParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const result = await archiveWorkspace(session.user.id, request.params.id)
    if (!result.ok) {
        if (result.reason === "not_found") {
            return reply.status(404).send({ error: "Workspace not found" })
        }
        return reply.status(400).send({ error: "This workspace can't be archived" })
    }
    return result.workspace
}

export async function deleteWorkspaceHandler(request: FastifyRequest<{ Params: WorkspaceParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const result = await deleteWorkspace(session.user.id, request.params.id)
    if (!result.ok) {
        if (result.reason === "not_found") {
            return reply.status(404).send({ error: "Workspace not found" })
        }
        return reply.status(400).send({ error: "This workspace can't be deleted" })
    }
    return reply.status(204).send()
}