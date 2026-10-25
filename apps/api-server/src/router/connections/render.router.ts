import { FastifyInstance } from "fastify"
import {
  connectRenderHandler,
  disconnectRenderHandler,
  renderDetailsHandler,
} from "../../controller/connections/render.controller.js"

// Registers Render API-key connect, details and disconnect routes.
// Mounted under /connections/render.
export async function renderRouter(app: FastifyInstance): Promise<void> {
  // Account and accessible services for the user's Render connection.
  app.get("/", renderDetailsHandler)

  // Render has no OAuth: the user's pasted API key is posted here.
  app.post("/", connectRenderHandler)

  app.delete("/", disconnectRenderHandler)
}
