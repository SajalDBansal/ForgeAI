import { FastifyInstance } from "fastify"
import { listAccountCollaboratorsHandler } from "../controller/collaborator.controller.js"

// Registers account-wide collaborator routes.
// Lists everyone the user shares workspaces with.
export async function collaboratorRouter(app: FastifyInstance): Promise<void> {
  app.get("/", listAccountCollaboratorsHandler)
}
