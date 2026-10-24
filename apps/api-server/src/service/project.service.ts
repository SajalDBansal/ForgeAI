import { prisma, RepoRef } from "@forgeAI/database"
import { enqueueTask, recordAudit } from "@forgeAI/jobs"
import {
  CreateProjectDataType,
  Project,
  ProjectInfoData,
  projectInfoSchema,
  projectNameFromPrompt,
  ProjectSource,
  TemplateInfo,
  toTemplateInfo,
  UpdateProjectDataType,
} from "@forgeAI/shared"
import type { FastifyInstance } from "fastify"
import { releaseProjectPod } from "./sandbox.service.js"
import {
  workspaceAccessFilter,
  workspaceContributorFilter,
} from "./workspace.service.js"
import { getConnection } from "./connections/index.js"
import { githubUserToken } from "./connections/github.service.js"
import { visibleTemplatesFilter } from "./template.service.js"
import { getInstallationRepo } from "../lib/connections/github.js"
import {
  publishAccessChanged,
  publishProjectEvent,
} from "../lib/project-events.js"
import { enqueueProjectCleanup } from "../lib/background-jobs.js"

// Builds the opening chat line for a project started from a template.
// Written as the user, since it records their intent.
function templatePrompt(templateName: string): string {
  return `Start a coding environment for me with the ${templateName} template.`
}

// Returns a random 4-digit suffix for template-based project names.
// Keeps repeated "nextjs-starter" projects distinguishable.
function randomProjectSuffix(): string {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

// Seeds the project's Info tab from its template's metadata.
// So the Info tab isn't empty before any agent work happens.
function projectInfoFromTemplate(template: TemplateInfo): ProjectInfoData {
  return projectInfoSchema.parse({
    brief: [
      { label: "Template", value: `${template.name} v${template.version}` },
      { label: "Description", value: template.longDesc },
      { label: "Author", value: template.author },
      { label: "License", value: template.license },
    ],
    planSteps: template.screens.map((s) => ({
      label: `${s.name} (${s.path})`,
      status: "pending" as const,
    })),
    requirements: [
      ...template.connections.map((c) => ({
        label: c.name,
        value: `${c.kind} · ${c.required ? "required" : "optional"}`,
      })),
      ...template.envVars.map((v) => ({
        label: v.key,
        value: `${v.desc} · ${v.required ? "required" : "optional"}`,
      })),
    ],
    timeline: [
      {
        at: new Date().toISOString(),
        label: `Created from the "${template.name}" template`,
      },
    ],
    filesChanged: [],
    dependencies: [...template.stack, ...template.deps],
    colors: [],
    disclaimers: (template.dbSchema ?? []).map(
      (d) => `Suggested table: ${d.table} (${d.cols})`,
    ),
    sessionId: null,
  })
}

type WorkspaceResolution =
  | { ok: true; workspaceId: string }
  | { ok: false; reason: "workspace_not_found" | "workspace_read_only" }

// Picks the workspace for a new project: the named one (if writable) or the user's base workspace.
// VIEWERs get `workspace_read_only` rather than a misleading not-found.
async function resolveWorkspaceId(
  userId: string,
  workspaceId?: string,
): Promise<WorkspaceResolution> {
  if (workspaceId) {
    const writable = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        archivedAt: null,
        ...workspaceContributorFilter(userId),
      },
      select: { id: true },
    })
    if (writable) return { ok: true, workspaceId: writable.id }

    const visible = await prisma.workspace.count({
      where: workspaceAccessFilter(userId, workspaceId),
    })
    return {
      ok: false,
      reason: visible > 0 ? "workspace_read_only" : "workspace_not_found",
    }
  }

  const fallback = await prisma.workspace.findFirst({
    where: { userId, archivedAt: null, deleteable: false },
    orderBy: [{ deleteable: "asc" }, { createdAt: "asc" }],
  })
  return fallback
    ? { ok: true, workspaceId: fallback.id }
    : { ok: false, reason: "workspace_not_found" }
}

export type ProjectWithRepo = Project & { repo: RepoRef | null }

export type CreateProjectResult =
  | { ok: true; project: ProjectWithRepo }
  | { ok: false; reason: "workspace_not_found" }
  | { ok: false; reason: "workspace_read_only" }
  | { ok: false; reason: "connection_not_found"; source: ProjectSource }
  | { ok: false; reason: "repo_not_found"; repo: string }
  | { ok: false; reason: "template_not_found" }

type CreateProjectFailure = Extract<CreateProjectResult, { ok: false }>

// Loads and validates the template a project is being created from, if any.
// A template the user can't see, or with bad metadata, counts as not found.
async function loadTemplate(
  userId: string,
  templateId: string | undefined,
): Promise<
  { ok: true; template: TemplateInfo | undefined } | CreateProjectFailure
> {
  if (!templateId) return { ok: true, template: undefined }

  const templateRow = await prisma.template.findFirst({
    where: { id: templateId, ...visibleTemplatesFilter(userId) },
  })
  if (!templateRow) return { ok: false, reason: "template_not_found" }
  try {
    return { ok: true, template: toTemplateInfo(templateRow) }
  } catch {
    return { ok: false, reason: "template_not_found" }
  }
}

// Records the GitHub repository an imported project comes from.
// Requires a live GitHub App installation that can see the repo.
async function linkImportedRepo(
  userId: string,
  input: CreateProjectDataType,
): Promise<{ ok: true; repoId: string | undefined } | CreateProjectFailure> {
  if (input.source === "MANUAL") return { ok: true, repoId: undefined }

  const connection = await getConnection(userId, input.source)
  const installationId = (
    connection?.settingsJson as { installationId?: number } | null
  )?.installationId
  if (
    !connection ||
    connection.status !== "CONNECTED" ||
    !installationId ||
    !input.repo
  ) {
    return { ok: false, reason: "connection_not_found", source: input.source }
  }

  const userToken = await githubUserToken(connection)
  if (!userToken)
    return { ok: false, reason: "connection_not_found", source: input.source }
  const found = await getInstallationRepo(
    String(installationId),
    input.repo.owner,
    input.repo.name,
    userToken,
  )
  if (!found)
    return {
      ok: false,
      reason: "repo_not_found",
      repo: `${input.repo.owner}/${input.repo.name}`,
    }

  const repo = await prisma.repoRef.create({
    data: {
      owner: found.owner,
      name: found.name,
      branch: input.repo.branch ?? found.defaultBranch,
      connectionId: connection.id,
    },
  })
  return { ok: true, repoId: repo.id }
}

// Creates a project from a prompt, a template or an imported GitHub repo.
// New manual projects also get a GitHub repo in the background when the owner is connected.
export async function createProject(
  _app: FastifyInstance,
  userId: string,
  input: CreateProjectDataType,
): Promise<CreateProjectResult> {
  const workspace = await resolveWorkspaceId(userId, input.workspaceId)
  if (!workspace.ok) return { ok: false, reason: workspace.reason }
  const workspaceId = workspace.workspaceId

  const loaded = await loadTemplate(userId, input.templateId)
  if (!loaded.ok) return loaded
  const template = loaded.template

  // The schema guarantees a prompt or a template, so this is never empty.
  const initialPrompt =
    input.initialPrompt?.trim() ||
    (template ? templatePrompt(template.name) : "")
  const name =
    input.name?.trim() ||
    (template
      ? `${template.name}${randomProjectSuffix()}`
      : projectNameFromPrompt(initialPrompt))

  const linked = await linkImportedRepo(userId, input)
  if (!linked.ok) return linked
  const repoId = linked.repoId

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        name,
        initialPrompt,
        status: input.mode === "PLAN" ? "PLANNING" : "BUILDING",
        stack: template ? template.stack.map((s) => s.name) : [],
        mode: input.mode,
        source: input.source,
        repoId,
        // Decides which E2B image the sandbox boots from.
        templateId: input.templateId,
        createdById: userId,
        workspaceId,
        // The prompt opens the project's conversation.
        messages: {
          create: {
            role: "USER",
            kind: "TEXT",
            content: initialPrompt,
            authorId: userId,
          },
        },
        ...(template && {
          info: { create: { data: projectInfoFromTemplate(template) } },
        }),
      },
      include: { repo: true },
    })

    if (input.templateId) {
      await tx.template.update({
        where: { id: input.templateId },
        data: { uses: { increment: 1 } },
      })
    }

    if (input.source === "MANUAL")
      await enqueueTask(tx, {
        type: "github.setup",
        projectId: created.id,
        actorId: userId,
      })
    await recordAudit(tx, {
      action: "project.created",
      actorId: userId,
      workspaceId,
      projectId: created.id,
    })
    return created
  })

  return { ok: true, project }
}

// Finds a project only if the user owns its workspace.
// Rename, archive and delete are owner-only; editors can only change what's inside.
async function findOwnedProject(
  userId: string,
  projectId: string,
): Promise<Project | null> {
  return prisma.project.findFirst({
    where: { id: projectId, workspace: { userId } },
  })
}

export type ProjectMutationResult =
  { ok: true; project: Project } | { ok: false; reason: "not_found" }

// Archives a project after saving and shutting down its sandbox.
// Owner only; open tabs lose write access immediately.
export async function archiveProject(
  app: FastifyInstance,
  userId: string,
  projectId: string,
): Promise<ProjectMutationResult> {
  const project = await findOwnedProject(userId, projectId)
  if (!project) return { ok: false, reason: "not_found" }

  // Saved first: a restore boots a fresh pod from the snapshot.
  await releaseProjectPod(app, projectId, { save: true })

  const archived = await prisma.$transaction(async (tx) => {
    const row = await tx.project.update({
      where: { id: projectId },
      data: { archivedAt: new Date() },
    })
    await recordAudit(tx, {
      action: "project.archived",
      actorId: userId,
      projectId,
      workspaceId: project.workspaceId,
    })
    return row
  })
  await publishAccessChanged([projectId], null)
  return { ok: true, project: archived }
}

// Un-archives a project; open tabs regain write access.
// Owner only.
export async function restoreProject(
  userId: string,
  projectId: string,
): Promise<ProjectMutationResult> {
  const project = await findOwnedProject(userId, projectId)
  if (!project) return { ok: false, reason: "not_found" }

  const restored = await prisma.$transaction(async (tx) => {
    const row = await tx.project.update({
      where: { id: projectId },
      data: { archivedAt: null },
    })
    await recordAudit(tx, {
      action: "project.restored",
      actorId: userId,
      projectId,
      workspaceId: project.workspaceId,
    })
    return row
  })
  await publishAccessChanged([projectId], null)
  return { ok: true, project: restored }
}

// Renames a project or changes its description, and tells open tabs.
// Owner only.
export async function updateProject(
  userId: string,
  projectId: string,
  input: UpdateProjectDataType,
): Promise<ProjectMutationResult> {
  const project = await findOwnedProject(userId, projectId)
  if (!project) return { ok: false, reason: "not_found" }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && {
        description: input.description,
      }),
    },
  })
  publishProjectEvent({
    type: "project.updated",
    projectId,
    project: { name: updated.name, description: updated.description },
  })
  return { ok: true, project: updated }
}

// Permanently deletes a project, killing its sandbox and purging its R2 files.
// Owner only; not saved first since nothing can restore it.
export async function deleteProject(
  app: FastifyInstance,
  userId: string,
  projectId: string,
): Promise<ProjectMutationResult> {
  const project = await findOwnedProject(userId, projectId)
  if (!project) return { ok: false, reason: "not_found" }

  // Kill the sandbox first; once the row is gone nothing can find it again.
  await releaseProjectPod(app, projectId, { save: false })

  await prisma.$transaction(async (tx) => {
    await tx.project.delete({ where: { id: projectId } })
    await enqueueProjectCleanup(tx, projectId)
    await recordAudit(tx, {
      action: "project.deleted",
      actorId: userId,
      projectId,
      workspaceId: project.workspaceId,
    })
  })
  await publishAccessChanged([projectId], null)
  return { ok: true, project }
}
