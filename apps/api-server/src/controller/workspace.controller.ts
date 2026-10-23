import { FastifyReply, FastifyRequest } from "fastify"
import { createWorkspaceSchema, updateWorkspaceSchema } from "@forgeAI/shared"
import { requireSession } from "../lib/session.js"
import { firstIssue } from "../lib/http.js"
import { withIdempotency } from "../lib/idempotency.js"
import {
  archiveWorkspace,
  createWorkspace,
  deleteWorkspace,
  getWorkspaceDetail,
  restoreWorkspace,
  updateWorkspace,
} from "../service/workspace.service.js"

interface WorkspaceParams {
  id: string
}

// POST /workspace: creates a workspace owned by the user.
// Backs the "New workspace" dialog; an Idempotency-Key stops a double click from
// creating two workspaces.
export async function createWorkspaceHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const parsed = createWorkspaceSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }

  await withIdempotency(
    reply,
    session.user.id,
    request.headers["idempotency-key"],
    async () => {
      const workspace = await createWorkspace(session.user.id, parsed.data.name)
      return { status: 201, body: workspace }
    },
  )
}

// GET /workspace/:id: returns a workspace with its projects and collaborators.
// Visible to the owner and any collaborator.
export async function getWorkspaceHandler(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await getWorkspaceDetail(session.user.id, request.params.id)
  if (!result.ok) {
    return reply.status(404).send({ error: "Workspace not found" })
  }
  return result.workspace
}

// PATCH /workspace/:id: renames a workspace.
// Owner only.
export async function updateWorkspaceHandler(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const parsed = updateWorkspaceSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }

  const result = await updateWorkspace(
    session.user.id,
    request.params.id,
    parsed.data,
  )
  if (!result.ok) {
    return reply.status(404).send({ error: "Workspace not found" })
  }
  return result.workspace
}

// POST /workspace/:id/archive: archives a workspace and its projects.
// Owner only; base workspaces can't be archived.
export async function archiveWorkspaceHandler(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await archiveWorkspace(
    request.server,
    session.user.id,
    request.params.id,
  )
  if (!result.ok) {
    if (result.reason === "not_found") {
      return reply.status(404).send({ error: "Workspace not found" })
    }
    return reply.status(400).send({ error: "This workspace can't be archived" })
  }
  return result.workspace
}

// POST /workspace/:id/restore: brings an archived workspace back.
// Owner only.
export async function restoreWorkspaceHandler(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await restoreWorkspace(session.user.id, request.params.id)
  if (!result.ok) {
    return reply.status(404).send({ error: "Workspace not found" })
  }
  return result.workspace
}

// DELETE /workspace/:id: permanently deletes a workspace and its projects.
// Owner only; base workspaces can't be deleted.
export async function deleteWorkspaceHandler(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await deleteWorkspace(
    request.server,
    session.user.id,
    request.params.id,
  )
  if (!result.ok) {
    if (result.reason === "not_found") {
      return reply.status(404).send({ error: "Workspace not found" })
    }
    return reply.status(400).send({ error: "This workspace can't be deleted" })
  }
  return reply.status(204).send()
}
