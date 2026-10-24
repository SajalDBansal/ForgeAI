import { prisma } from "@forgeAI/database"
import { listAccountCollaborators } from "./collaborator.service.js"
import { workspaceMembershipFilter } from "./workspace.service.js"

// Loads the account's workspaces, their projects and collaborators in one call.
// Fetched once at startup so components don't each re-request the same data.
export async function getProjectsMetadata(userId: string) {
  const [workspaces, projects, collaborators] = await Promise.all([
    prisma.workspace.findMany({
      where: workspaceMembershipFilter(userId),
      // `userId` is the owner; the client uses it to gate owner-only actions.
      select: {
        id: true,
        name: true,
        userId: true,
        deleteable: true,
        archivedAt: true,
      },
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
        createdById: true,
        createdBy: { select: { name: true } },
      },
      orderBy: { lastUsed: "desc" },
    }),
    listAccountCollaborators(userId),
  ])

  return { workspaces, projects, collaborators }
}
