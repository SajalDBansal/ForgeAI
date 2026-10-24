import { FastifyInstance } from "fastify"
import {
  acceptInvitationHandler,
  getInvitationPreviewHandler,
} from "../controller/invitation.controller.js"

// Registers the public invitation preview and accept routes.
// Backs the /invite/:token page.
export async function inviteRouter(app: FastifyInstance): Promise<void> {
  app.get("/:token", getInvitationPreviewHandler)
  app.post("/:token/accept", acceptInvitationHandler)
}
