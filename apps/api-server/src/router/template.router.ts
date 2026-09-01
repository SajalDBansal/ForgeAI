import { FastifyInstance } from "fastify";
import { getTemplateHandler, listTemplatesHandler } from "../controller/template.controller.js";

export async function templateRouter(app: FastifyInstance): Promise<void> {
    app.get("/", listTemplatesHandler)
    app.get("/:id", getTemplateHandler)
}
