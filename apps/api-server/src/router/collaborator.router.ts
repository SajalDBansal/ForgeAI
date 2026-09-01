import { FastifyInstance } from "fastify";
import { listAccountCollaboratorsHandler } from "../controller/collaborator.controller.js";

export async function collaboratorRouter(app: FastifyInstance): Promise<void> {
    app.get("/", listAccountCollaboratorsHandler)
}
