import { FastifyReply, FastifyRequest } from "fastify"
import { requireSession } from "../lib/session.js"
import { createProjectSchema, updateProjectSchema } from "@forgeAI/shared"
import { archiveProject, createProject, deleteProject, restoreProject, updateProject } from "../service/project.service.js"

export async function createProjectHandler(request: FastifyRequest, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const parsed = createProjectSchema.safeParse(request.body)
    if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" })
    }

    const result = await createProject(session.user.id, parsed.data)
    if (!result.ok) {
        if (result.reason === "workspace_not_found") {
            return reply.status(404).send({ error: "Workspace not found" })
        }
        return reply.status(400).send({ error: `Connect ${result.source} before creating a project from it` })
    }
    return reply.status(201).send(result.project)
}

interface ProjectParams {
    id: string
}

export async function archiveProjectHandler(request: FastifyRequest<{ Params: ProjectParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const result = await archiveProject(session.user.id, request.params.id)
    if (!result.ok) {
        return reply.status(404).send({ error: "Project not found" })
    }
    return result.project
}

export async function restoreProjectHandler(request: FastifyRequest<{ Params: ProjectParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const result = await restoreProject(session.user.id, request.params.id)
    if (!result.ok) {
        return reply.status(404).send({ error: "Project not found" })
    }
    return result.project
}

export async function updateProjectHandler(request: FastifyRequest<{ Params: ProjectParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const parsed = updateProjectSchema.safeParse(request.body)
    if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" })
    }

    const result = await updateProject(session.user.id, request.params.id, parsed.data)
    if (!result.ok) {
        return reply.status(404).send({ error: "Project not found" })
    }
    return result.project
}

export async function deleteProjectHandler(request: FastifyRequest<{ Params: ProjectParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const result = await deleteProject(session.user.id, request.params.id)
    if (!result.ok) {
        return reply.status(404).send({ error: "Project not found" })
    }
    return reply.status(204).send()
}