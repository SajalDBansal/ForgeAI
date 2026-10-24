import { FastifyInstance } from "fastify"
import {
  archiveWorkspaceHandler,
  createWorkspaceHandler,
  deleteWorkspaceHandler,
  getWorkspaceHandler,
  restoreWorkspaceHandler,
  updateWorkspaceHandler,
} from "../controller/workspace.controller.js"
import {
  inviteWorkspaceCollaboratorHandler,
  listWorkspaceCollaboratorsHandler,
  removeWorkspaceCollaboratorHandler,
  updateWorkspaceCollaboratorRoleHandler,
} from "../controller/collaborator.controller.js"
import {
  listWorkspaceInvitationsHandler,
  resendInvitationHandler,
  revokeInvitationHandler,
} from "../controller/invitation.controller.js"

// Registers workspace CRUD, collaborator and invitation routes.
// Backs the workspace settings pages.
export async function workspaceRouter(app: FastifyInstance): Promise<void> {
  app.post("/", createWorkspaceHandler)
  app.get("/:id", getWorkspaceHandler)
  app.patch("/:id", updateWorkspaceHandler)
  app.post("/:id/archive", archiveWorkspaceHandler)
  app.post("/:id/restore", restoreWorkspaceHandler)
  app.delete("/:id", deleteWorkspaceHandler)

  app.get("/:id/collaborators", listWorkspaceCollaboratorsHandler)
  app.post("/:id/collaborators/invite", inviteWorkspaceCollaboratorHandler)
  app.patch(
    "/:id/collaborators/:userId",
    updateWorkspaceCollaboratorRoleHandler,
  )
  app.delete("/:id/collaborators/:userId", removeWorkspaceCollaboratorHandler)

  app.get("/:id/invitations", listWorkspaceInvitationsHandler)
  app.delete("/:id/invitations/:invitationId", revokeInvitationHandler)
  app.post("/:id/invitations/:invitationId/resend", resendInvitationHandler)
}
