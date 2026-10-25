import { FastifyReply, FastifyRequest } from "fastify"
import { requireSession } from "../lib/session.js"
import { firstIssue } from "../lib/http.js"
import { withIdempotency } from "../lib/idempotency.js"
import { createProjectSchema, updateProjectSchema } from "@forgeAI/shared"
import {
  archiveProject,
  createProject,
  deleteProject,
  restoreProject,
  updateProject,
} from "../service/project.service.js"

// POST /project: creates a project from a prompt, template or GitHub repo.
// Maps each creation failure to a specific status and message; an Idempotency-Key
// header stops a double click or a retried request from creating a second project.
export async function createProjectHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const parsed = createProjectSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }

  await withIdempotency(
    reply,
    session.user.id,
    request.headers["idempotency-key"],
    async () => {
      const result = await createProject(
        request.server,
        session.user.id,
        parsed.data,
      )
      if (!result.ok) {
        if (result.reason === "workspace_not_found") {
          return { status: 404, body: { error: "Workspace not found" } }
        }
        if (result.reason === "workspace_read_only") {
          return {
            status: 403,
            body: {
              error:
                "You have view-only access to this workspace — ask its owner to make you an editor to create projects here.",
            },
          }
        }
        if (result.reason === "repo_not_found") {
          return {
            status: 404,
            body: {
              error: `Repository ${result.repo} not found, or ForgeAI's GitHub App doesn't have access to it`,
            },
          }
        }
        if (result.reason === "template_not_found") {
          return { status: 404, body: { error: "Template not found" } }
        }
        return {
          status: 400,
          body: {
            error: `Connect ${result.source} before creating a project from it`,
          },
        }
      }
      return { status: 201, body: result.project }
    },
  )
}

interface ProjectParams {
  id: string
}

// POST /project/:id/archive: archives a project.
// Owner only.
export async function archiveProjectHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await archiveProject(
    request.server,
    session.user.id,
    request.params.id,
  )
  if (!result.ok) {
    return reply.status(404).send({ error: "Project not found" })
  }
  return result.project
}

// POST /project/:id/restore: un-archives a project.
// Owner only.
export async function restoreProjectHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await restoreProject(session.user.id, request.params.id)
  if (!result.ok) {
    return reply.status(404).send({ error: "Project not found" })
  }
  return result.project
}

// PATCH /project/:id: updates a project's name or description.
// Owner only.
export async function updateProjectHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const parsed = updateProjectSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }

  const result = await updateProject(
    session.user.id,
    request.params.id,
    parsed.data,
  )
  if (!result.ok) {
    return reply.status(404).send({ error: "Project not found" })
  }
  return result.project
}

// DELETE /project/:id: permanently deletes a project.
// Owner only.
export async function deleteProjectHandler(
  request: FastifyRequest<{ Params: ProjectParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await deleteProject(
    request.server,
    session.user.id,
    request.params.id,
  )
  if (!result.ok) {
    return reply.status(404).send({ error: "Project not found" })
  }
  return reply.status(204).send()
}
