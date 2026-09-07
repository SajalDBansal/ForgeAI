// Prisma filter for project access: any member may read; owner/EDITOR may write, and only if not archived.
// Kept pure so regressions can assert the policy without booting Prisma.
export function projectAccessFilter(
  userId: string,
  projectId: string,
  access: "read" | "write",
) {
  const collaborator =
    access === "write" ? { userId, role: "EDITOR" as const } : { userId }
  const workspace = {
    OR: [{ userId }, { collaborators: { some: collaborator } }],
  }

  if (access === "write") {
    return {
      id: projectId,
      archivedAt: null,
      workspace: { ...workspace, archivedAt: null },
    }
  }
  return { id: projectId, workspace }
}

// Prisma filter for read access to a live (non-archived) project in a live workspace.
export function liveProjectFilter(userId: string, projectId: string) {
  const readable = projectAccessFilter(userId, projectId, "read")
  return {
    ...readable,
    archivedAt: null,
    workspace: { ...readable.workspace, archivedAt: null },
  }
}
