import { FastifyInstance } from "fastify";
import { acceptInvitationHandler, getInvitationPreviewHandler } from "../controller/invitation.controller.js";

export async function inviteRouter(app: FastifyInstance): Promise<void> {
    app.get("/:token", getInvitationPreviewHandler)
    app.post("/:token/accept", acceptInvitationHandler)
}
