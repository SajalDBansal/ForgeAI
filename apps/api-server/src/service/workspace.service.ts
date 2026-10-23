import { prisma } from "@forgeAI/database"
import { recordAudit } from "@forgeAI/jobs"
import {
  UpdateWorkspaceDataType,
  Workspace,
  WorkspaceDetail,
} from "@forgeAI/shared"
import type { FastifyInstance } from "fastify"
import { releaseProjectPod } from "./sandbox.service.js"
import { publishAccessChanged } from "../lib/project-events.js"
import { enqueueProjectCleanup } from "../lib/background-jobs.js"

// Lists the ids of every project in a workspace.
// Used to notify open tabs when workspace access changes.
export async function workspaceProjectIds(
  workspaceId: string,
): Promise<string[]> {
  const projects = await prisma.project.findMany({
    where: { workspaceId },
    select: { id: true },
  })
  return projects.map((project) => project.id)
}

export const collaboratorSelect = {
  id: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, image: true } },
} as const

// Prisma filter for workspaces the user owns or collaborates on (archived included).
// Base of every visibility check.
export function workspaceMembershipFilter(userId: string) {
  return { OR: [{ userId }, { collaborators: { some: { userId } } }] }
}

// Prisma filter for non-archived workspaces the user belongs to.
// Used wherever archived workspaces should be hidden.
export function visibleWorkspacesFilter(userId: string) {
  return { archivedAt: null, ...workspaceMembershipFilter(userId) }
}

// Prisma filter for workspaces the user may add to: owner or EDITOR collaborator.
// VIEWERs can open everything but change nothing.
export function workspaceContributorFilter(userId: string) {
  return {
    OR: [
      { userId },
      { collaborators: { some: { userId, role: "EDITOR" as const } } },
    ],
  }
}

// Prisma filter for one workspace the user owns or collaborates on.
// Used for workspace detail and collaborator reads.
export function workspaceAccessFilter(userId: string, workspaceId: string) {
  return {
    id: workspaceId,
    OR: [{ userId }, { collaborators: { some: { userId } } }],
  }
}

// Creates the undeletable base workspace for a new account.
// Called from better-auth's user-created hook.
export async function createDefaultWorkspace(user: {
  id: string
  name: string
}): Promise<void> {
  await prisma.workspace.create({
    data: {
      name: `${user.name.split(" ")[0]}'s Workspace`,
      description: "This is the base workspace for the user.",
      deleteable: false,
      userId: user.id,
    },
  })
}

// Finds a workspace only if the user owns it.
// Guards every owner-only workspace action.
export async function findOwnedWorkspace(
  userId: string,
  workspaceId: string,
): Promise<Workspace | null> {
  return prisma.workspace.findFirst({ where: { id: workspaceId, userId } })
}

// Creates a new workspace owned by the user.
// Backs POST /workspace.
export async function createWorkspace(
  userId: string,
  name: string,
): Promise<Workspace> {
  return prisma.workspace.create({
    data: { userId, name },
  })
}

export type WorkspaceMutationResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; reason: "not_found" | "not_deleteable" }

// Shuts down every sandbox for a workspace's projects (saving first when `save`).
// Archive saves because it can be restored; delete doesn't.
async function releaseWorkspacePods(
  app: FastifyInstance,
  workspaceId: string,
  { save }: { save: boolean },
): Promise<void> {
  const projects = await prisma.project.findMany({
    where: { workspaceId },
    select: { id: true },
  })
  // Sequential so the single orchestrator process isn't stampeded.
  for (const project of projects)
    await releaseProjectPod(app, project.id, { save })
}

// Archives a workspace and its live projects after saving their sandboxes.
// Projects the user archived by hand stay archived on restore.
export async function archiveWorkspace(
  app: FastifyInstance,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMutationResult> {
  const workspace = await findOwnedWorkspace(userId, workspaceId)
  if (!workspace) return { ok: false, reason: "not_found" }
  if (!workspace.deleteable) return { ok: false, reason: "not_deleteable" }
  if (workspace.archivedAt) return { ok: true, workspace }

  await releaseWorkspacePods(app, workspaceId, { save: true })

  // Only archive projects that aren't already, so a later restore keeps manual archives.
  const archivedAt = new Date()
  const archived = await prisma.$transaction(async (tx) => {
    // Keep the archive timestamp stable when two archive requests arrive together.
    await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`
    const current = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
    })
    if (current.archivedAt) return current
    await tx.project.updateMany({
      where: { workspaceId, archivedAt: null },
      data: { archivedAt },
    })
    await recordAudit(tx, {
      action: "workspace.archived",
      actorId: userId,
      workspaceId,
    })
    return tx.workspace.update({
      where: { id: workspaceId },
      data: { archivedAt },
    })
  })
  // Open tabs on its projects lose write access now.
  await publishAccessChanged(await workspaceProjectIds(workspaceId), null)
  return { ok: true, workspace: archived }
}

// Un-archives a workspace and tells open tabs their access changed.
// Owner only.
export async function restoreWorkspace(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMutationResult> {
  const workspace = await findOwnedWorkspace(userId, workspaceId)
  if (!workspace) return { ok: false, reason: "not_found" }

  const restored = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`
    const current = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
    })
    // Only restore projects archived by this workspace action; preserve manual archives.
    if (current.archivedAt)
      await tx.project.updateMany({
        where: { workspaceId, archivedAt: current.archivedAt },
        data: { archivedAt: null },
      })
    await recordAudit(tx, {
      action: "workspace.restored",
      actorId: userId,
      workspaceId,
    })
    return tx.workspace.update({
      where: { id: workspaceId },
      data: { archivedAt: null },
    })
  })
  await publishAccessChanged(await workspaceProjectIds(workspaceId), null)
  return { ok: true, workspace: restored }
}

// Deletes a workspace (projects cascade), killing sandboxes and purging R2 files.
// Owner only; base workspaces can't be deleted.
export async function deleteWorkspace(
  app: FastifyInstance,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMutationResult> {
  const workspace = await findOwnedWorkspace(userId, workspaceId)
  if (!workspace) return { ok: false, reason: "not_found" }
  if (!workspace.deleteable) return { ok: false, reason: "not_deleteable" }

  // Sandboxes don't cascade with the rows, so kill them first.
  await releaseWorkspacePods(app, workspaceId, { save: false })

  // Read before the delete: the projects go with the workspace.
  const projectIds = await workspaceProjectIds(workspaceId)
  await prisma.$transaction(async (tx) => {
    await tx.workspace.delete({ where: { id: workspaceId } })
    for (const projectId of projectIds)
      await enqueueProjectCleanup(tx, projectId)
    await recordAudit(tx, {
      action: "workspace.deleted",
      actorId: userId,
      workspaceId,
    })
  })
  await publishAccessChanged(projectIds, null)
  return { ok: true, workspace }
}

// Renames a workspace.
// Owner only.
export async function updateWorkspace(
  userId: string,
  workspaceId: string,
  input: UpdateWorkspaceDataType,
): Promise<WorkspaceMutationResult> {
  const workspace = await findOwnedWorkspace(userId, workspaceId)
  if (!workspace) return { ok: false, reason: "not_found" }

  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { name: input.name },
  })
  return { ok: true, workspace: updated }
}

export type WorkspaceDetailResult =
  { ok: true; workspace: WorkspaceDetail } | { ok: false; reason: "not_found" }

// Loads a workspace with its projects and collaborators.
// Visible to the owner and any collaborator.
export async function getWorkspaceDetail(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceDetailResult> {
  const workspace = await prisma.workspace.findFirst({
    where: workspaceAccessFilter(userId, workspaceId),
    include: {
      projects: { orderBy: { lastUsed: "desc" } },
      collaborators: {
        select: collaboratorSelect,
        orderBy: { createdAt: "asc" },
      },
    },
  })
  if (!workspace) return { ok: false, reason: "not_found" }

  return { ok: true, workspace }
}
