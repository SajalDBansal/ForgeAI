import { prisma } from "@forgeAI/database";
import { workspaceMembershipFilter } from "./workspace.service.js";

export async function getProjectsMetadata(userId: string) {
    const [workspaces, projects] = await Promise.all([
        prisma.workspace.findMany({
            where: workspaceMembershipFilter(userId),
            select: { id: true, name: true, deleteable: true, archivedAt: true },
            orderBy: [{ deleteable: "asc" }, { createdAt: "asc" }],
        }),
        prisma.project.findMany({
            where: { workspace: workspaceMembershipFilter(userId) },
            select: {
                id: true,
                name: true,
                description: true,
                initialPrompt: true,
                status: true,
                starred: true,
                stack: true,
                mode: true,
                source: true,
                workspaceId: true,
                lastUsed: true,
                archivedAt: true,
            },
            orderBy: { lastUsed: "desc" },
        }),
    ]);

    return { workspaces, projects }
}