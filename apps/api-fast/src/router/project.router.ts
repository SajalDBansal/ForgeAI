import { FastifyInstance } from "fastify";
import { archiveProjectHandler, createProjectHandler, deleteProjectHandler } from "../controller/project.controller.js";

export async function projectRouter(app: FastifyInstance): Promise<void> {
    app.post("/", createProjectHandler)
    app.post("/:id/archive", archiveProjectHandler)
    app.delete("/:id", deleteProjectHandler)
}