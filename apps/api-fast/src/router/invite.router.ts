import { FastifyInstance } from "fastify";
import { acceptInvitationHandler, getInvitationPreviewHandler } from "../controller/invitation.controller.js";

/**
 * Token-addressed invite routes. The preview is deliberately public — the invitee
 * has no account yet when they open the link — while accepting requires a session.
 */
export async function inviteRouter(app: FastifyInstance): Promise<void> {
    app.get("/:token", getInvitationPreviewHandler)
    app.post("/:token/accept", acceptInvitationHandler)
}
