import { FastifyInstance } from "fastify"
import { getAppMetadataHandler } from "../controller/metadata.controller.js"

// Registers the app-metadata route.
// Loads the signed-in user's workspaces and profile for the shell.
export async function metadataRouter(app: FastifyInstance): Promise<void> {
  app.get("/user", getAppMetadataHandler)
}
