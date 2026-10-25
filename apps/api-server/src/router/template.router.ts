import { FastifyInstance } from "fastify"
import {
  getTemplateHandler,
  getTemplateDownloadHandler,
  listTemplatesHandler,
} from "../controller/template.controller.js"

// Registers template list, detail and download routes.
// Backs the templates gallery.
export async function templateRouter(app: FastifyInstance): Promise<void> {
  app.get("/", listTemplatesHandler)
  app.get("/:id", getTemplateHandler)
  app.get("/:id/download", getTemplateDownloadHandler)
}
