import { prisma } from "@forgeAI/database";
import { UpdateWorkspaceDataType, Workspace, WorkspaceDetail } from "@forgeAI/shared";

/** The profile fields a collaborator row exposes — never the whole user record. */
export const collaboratorSelect = {
    id: true,
    role: true,
    createdAt: true,
    user: { select: { id: true, name: true, email: true, image: true } },
} as const

/** Every non-archived workspace the user owns or collaborates on. */
export function visibleWorkspacesFilter(userId: string) {
    return { archivedAt: null, OR: [{ userId }, { collaborators: { some: { userId } } }] }
}

/**
 * Owners get full access; collaborators get read access. Mutating routes stay on
 * findOwnedWorkspace so only the owner can rename, archive, delete or manage collaborators.
 */
export function workspaceAccessFilter(userId: string, workspaceId: string) {
    return {
        id: workspaceId,
        OR: [{ userId }, { collaborators: { some: { userId } } }],
    }
}

export async function createDefaultWorkspace(user: { id: string, name: string }): Promise<void> {
    await prisma.workspace.create({
        data: {
            name: `${user.name.split(" ")[0]}'s Workspace`,
            description: "This is the base workspace for the user.",
            deleteable: false,
            userId: user.id,
        }
    })
}

export async function findOwnedWorkspace(userId: string, workspaceId: string): Promise<Workspace | null> {
    return prisma.workspace.findFirst({ where: { id: workspaceId, userId } })
}

export async function createWorkspace(userId: string, name: string): Promise<Workspace> {
    return prisma.workspace.create({
        data: { userId, name },
    })
}

export type WorkspaceMutationResult =
    | { ok: true; workspace: Workspace }
    | { ok: false; reason: "not_found" | "not_deleteable" }

export async function archiveWorkspace(userId: string, workspaceId: string): Promise<WorkspaceMutationResult> {
    const workspace = await findOwnedWorkspace(userId, workspaceId)
    if (!workspace) return { ok: false, reason: "not_found" }
    if (!workspace.deleteable) return { ok: false, reason: "not_deleteable" }

    const archived = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { archivedAt: new Date() },
    })
    return { ok: true, workspace: archived }
}

export async function deleteWorkspace(userId: string, workspaceId: string): Promise<WorkspaceMutationResult> {
    const workspace = await findOwnedWorkspace(userId, workspaceId)
    if (!workspace) return { ok: false, reason: "not_found" }
    if (!workspace.deleteable) return { ok: false, reason: "not_deleteable" }

    await prisma.workspace.delete({ where: { id: workspaceId } })
    return { ok: true, workspace }
}
export async function updateWorkspace(userId: string, workspaceId: string, input: UpdateWorkspaceDataType): Promise<WorkspaceMutationResult> {
    const workspace = await findOwnedWorkspace(userId, workspaceId)
    if (!workspace) return { ok: false, reason: "not_found" }

    const updated = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { name: input.name },
    })
    return { ok: true, workspace: updated }
}

export type WorkspaceDetailResult =
    | { ok: true; workspace: WorkspaceDetail }
    | { ok: false; reason: "not_found" }

export async function getWorkspaceDetail(userId: string, workspaceId: string): Promise<WorkspaceDetailResult> {
    const workspace = await prisma.workspace.findFirst({
        where: workspaceAccessFilter(userId, workspaceId),
        include: {
            projects: { orderBy: { lastUsed: "desc" } },
            collaborators: { select: collaboratorSelect, orderBy: { createdAt: "asc" } },
        },
    })
    if (!workspace) return { ok: false, reason: "not_found" }

    return { ok: true, workspace }
}
