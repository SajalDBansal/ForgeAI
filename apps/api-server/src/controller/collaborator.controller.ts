import { FastifyReply, FastifyRequest } from "fastify"
import {
  inviteCollaboratorSchema,
  updateCollaboratorRoleSchema,
} from "@forgeAI/shared"
import { requireSession } from "../lib/session.js"
import { firstIssue } from "../lib/http.js"
import { withIdempotency } from "../lib/idempotency.js"
import {
  inviteWorkspaceCollaborator,
  listAccountCollaborators,
  listWorkspaceCollaborators,
  removeWorkspaceCollaborator,
  updateWorkspaceCollaboratorRole,
} from "../service/collaborator.service.js"

interface WorkspaceParams {
  id: string
}

interface WorkspaceCollaboratorParams extends WorkspaceParams {
  userId: string
}

// GET /collaborator: lists collaborators across all the user's workspaces.
// Backs the account-wide people view.
export async function listAccountCollaboratorsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  return listAccountCollaborators(session.user.id)
}

// GET /workspace/:id/collaborators: lists one workspace's collaborators.
// Visible to the owner and any collaborator.
export async function listWorkspaceCollaboratorsHandler(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await listWorkspaceCollaborators(
    session.user.id,
    request.params.id,
  )
  if (!result.ok) {
    return reply.status(404).send({ error: "Workspace not found" })
  }
  return result.collaborators
}

// POST /workspace/:id/collaborators/invite: adds a user or emails an invitation.
// The email is queued durably with the invitation; 201 does not promise delivery. An
// Idempotency-Key stops a retried request from inviting the same address twice.
export async function inviteWorkspaceCollaboratorHandler(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const parsed = inviteCollaboratorSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }

  await withIdempotency(
    reply,
    session.user.id,
    request.headers["idempotency-key"],
    async () => {
      const result = await inviteWorkspaceCollaborator(
        session.user.id,
        request.params.id,
        parsed.data,
      )
      if (!result.ok) {
        if (result.reason === "workspace_not_found") {
          return { status: 404, body: { error: "Workspace not found" } }
        }
        if (result.reason === "already_invited") {
          return {
            status: 409,
            body: { error: "That address already has a pending invitation" },
          }
        }
        return {
          status: 409,
          body: { error: "That person already has access to this workspace" },
        }
      }

      return {
        status: 201,
        body:
          result.kind === "collaborator"
            ? {
                kind: result.kind,
                collaborator: result.collaborator,
                emailQueued: result.emailQueued,
              }
            : {
                kind: result.kind,
                invitation: result.invitation,
                emailQueued: result.emailQueued,
              },
      }
    },
  )
}

// PATCH /workspace/:id/collaborators/:userId: changes a collaborator's role.
// Owner only.
export async function updateWorkspaceCollaboratorRoleHandler(
  request: FastifyRequest<{ Params: WorkspaceCollaboratorParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const parsed = updateCollaboratorRoleSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: firstIssue(parsed.error) })
  }

  const result = await updateWorkspaceCollaboratorRole(
    session.user.id,
    request.params.id,
    request.params.userId,
    parsed.data.role,
  )
  if (!result.ok) {
    if (result.reason === "workspace_not_found") {
      return reply.status(404).send({ error: "Workspace not found" })
    }
    return reply.status(404).send({ error: "Collaborator not found" })
  }
  return result.collaborator
}

// DELETE /workspace/:id/collaborators/:userId: removes a collaborator or leaves the workspace.
// Owners can't leave their own workspace.
export async function removeWorkspaceCollaboratorHandler(
  request: FastifyRequest<{ Params: WorkspaceCollaboratorParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await removeWorkspaceCollaborator(
    session.user.id,
    request.params.id,
    request.params.userId,
  )
  if (!result.ok) {
    if (result.reason === "owner_cannot_leave") {
      return reply.status(400).send({
        error:
          "You own this workspace — archive or delete it instead of leaving.",
      })
    }
    if (result.reason === "workspace_not_found") {
      return reply.status(404).send({ error: "Workspace not found" })
    }
    return reply.status(404).send({ error: "Collaborator not found" })
  }
  return reply.status(204).send()
}
