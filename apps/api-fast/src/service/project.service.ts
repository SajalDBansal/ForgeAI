import { prisma } from "@forgeAI/database"
import { CreateProjectDataType, Project, projectNameFromPrompt, ProjectSource } from "@forgeAI/shared"
import { findOwnedWorkspace } from "./workspace.service.js"
import { getConnection } from "./connections/index.js"

async function resolveWorkspaceId(userId: string, workspaceId?: string): Promise<string | null> {
    if (workspaceId) {
        const workspace = await findOwnedWorkspace(userId, workspaceId)
        return workspace?.id ?? null
    }

    const fallback = await prisma.workspace.findFirst({
        where: { userId, archivedAt: null, deleteable: false },
        orderBy: [{ deleteable: "asc" }, { createdAt: "asc" }],
    })
    return fallback?.id ?? null
}

export type CreateProjectResult =
    | { ok: true; project: Project }
    | { ok: false; reason: "workspace_not_found" }
    | { ok: false; reason: "connection_not_found"; source: ProjectSource }

export async function createProject(userId: string, input: CreateProjectDataType): Promise<CreateProjectResult> {
    const initialPrompt = input.initialPrompt.trim()
    const workspaceId = await resolveWorkspaceId(userId, input.workspaceId)
    if (!workspaceId) return { ok: false, reason: "workspace_not_found" }

    let repoId: string | undefined
    if (input.source !== "MANUAL") {
        const connection = await getConnection(userId, input.source)
        if (!connection || !input.repo) return { ok: false, reason: "connection_not_found", source: input.source }

        const repo = await prisma.repoRef.create({
            data: { ...input.repo, connectionId: connection.id },
        })
        repoId = repo.id
    }

    const project = await prisma.project.create({
        data: {
            name: projectNameFromPrompt(initialPrompt),
            initialPrompt,
            status: input.mode === "PLAN" ? "PLANNING" : "BUILDING",
            stack: [],
            mode: input.mode,
            source: input.source,
            repoId,
            workspaceId,
        },
    })
    return { ok: true, project }
}

async function findOwnedProject(userId: string, projectId: string): Promise<Project | null> {
    return prisma.project.findFirst({ where: { id: projectId, workspace: { userId } } })
}

export type ProjectMutationResult =
    | { ok: true; project: Project }
    | { ok: false; reason: "not_found" }

export async function archiveProject(userId: string, projectId: string): Promise<ProjectMutationResult> {
    const project = await findOwnedProject(userId, projectId)
    if (!project) return { ok: false, reason: "not_found" }

    const archived = await prisma.project.update({
        where: { id: projectId },
        data: { archivedAt: new Date() },
    })
    return { ok: true, project: archived }
}

export async function deleteProject(userId: string, projectId: string): Promise<ProjectMutationResult> {
    const project = await findOwnedProject(userId, projectId)
    if (!project) return { ok: false, reason: "not_found" }

    await prisma.project.delete({ where: { id: projectId } })
    return { ok: true, project }
}