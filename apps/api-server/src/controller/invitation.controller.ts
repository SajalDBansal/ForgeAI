import { FastifyReply, FastifyRequest } from "fastify"
import { requireSession } from "../lib/session.js"
import { withIdempotency } from "../lib/idempotency.js"
import {
  acceptInvitation,
  getInvitationPreview,
  listWorkspaceInvitations,
  resendInvitation,
  revokeInvitation,
} from "../service/invitation.service.js"

interface WorkspaceParams {
  id: string
}

interface InvitationParams extends WorkspaceParams {
  invitationId: string
}

interface TokenParams {
  token: string
}

// GET /workspace/:id/invitations: lists a workspace's invitations.
// Owner only; stale ones are marked expired first.
export async function listWorkspaceInvitationsHandler(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await listWorkspaceInvitations(
    session.user.id,
    request.params.id,
  )
  if (!result.ok) {
    return reply.status(404).send({ error: "Workspace not found" })
  }
  return result.invitations
}

// DELETE /workspace/:id/invitations/:invitationId: revokes a pending invitation.
// Accepted invitations can't be revoked; remove the collaborator instead.
export async function revokeInvitationHandler(
  request: FastifyRequest<{ Params: InvitationParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await revokeInvitation(
    session.user.id,
    request.params.id,
    request.params.invitationId,
  )
  if (!result.ok) {
    if (result.reason === "workspace_not_found") {
      return reply.status(404).send({ error: "Workspace not found" })
    }
    if (result.reason === "not_pending") {
      return reply.status(409).send({
        error:
          "That invitation was already accepted — remove the collaborator instead",
      })
    }
    return reply.status(404).send({ error: "Invitation not found" })
  }
  return result.invitation
}

// POST /workspace/:id/invitations/:invitationId/resend: refreshes and re-sends an invitation.
// Returns 502 when the email couldn't be delivered. An Idempotency-Key stops a double
// click from emailing the same person twice.
export async function resendInvitationHandler(
  request: FastifyRequest<{ Params: InvitationParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  await withIdempotency(
    reply,
    session.user.id,
    request.headers["idempotency-key"],
    async () => {
      const result = await resendInvitation(
        session.user.id,
        request.params.id,
        request.params.invitationId,
      )
      if (!result.ok) {
        if (result.reason === "workspace_not_found") {
          return { status: 404, body: { error: "Workspace not found" } }
        }
        if (result.reason === "not_pending") {
          return {
            status: 409,
            body: { error: "That invitation was already accepted" },
          }
        }
        return { status: 404, body: { error: "Invitation not found" } }
      }

      if (!result.emailQueued) {
        request.log.error(
          { invitationId: request.params.invitationId },
          "invite email enqueue failed",
        )
        return {
          status: 502,
          body: { error: "We couldn't send that email — try again shortly" },
        }
      }
      return { status: 200, body: result.invitation }
    },
  )
}

// GET /invite/:token: public preview of an invitation (workspace, inviter, role).
// Backs the invite landing page before sign-in.
export async function getInvitationPreviewHandler(
  request: FastifyRequest<{ Params: TokenParams }>,
  reply: FastifyReply,
) {
  const result = await getInvitationPreview(request.params.token)
  if (!result.ok) {
    if (result.reason === "not_pending") {
      return reply
        .status(410)
        .send({ error: "This invitation is no longer valid" })
    }
    return reply.status(404).send({ error: "Invitation not found" })
  }
  return result.preview
}

// POST /invite/:token/accept: joins the workspace if the signed-in email matches.
// Returns the workspace id so the client can open it. Honors an Idempotency-Key when sent.
export async function acceptInvitationHandler(
  request: FastifyRequest<{ Params: TokenParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  await withIdempotency(
    reply,
    session.user.id,
    request.headers["idempotency-key"],
    async () => {
      const result = await acceptInvitation(session.user, request.params.token)
      if (!result.ok) {
        if (result.reason === "not_pending") {
          return {
            status: 410,
            body: { error: "This invitation is no longer valid" },
          }
        }
        if (result.reason === "email_mismatch") {
          return {
            status: 403,
            body: {
              error: "This invitation was sent to a different email address",
            },
          }
        }
        return { status: 404, body: { error: "Invitation not found" } }
      }
      return { status: 200, body: { workspaceId: result.workspaceId } }
    },
  )
}
