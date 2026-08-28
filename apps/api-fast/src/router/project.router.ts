import { FastifyInstance } from "fastify";
import { archiveProjectHandler, createProjectHandler, deleteProjectHandler, restoreProjectHandler, updateProjectHandler } from "../controller/project.controller.js";

export async function projectRouter(app: FastifyInstance): Promise<void> {
    app.post("/", createProjectHandler)
    app.patch("/:id", updateProjectHandler)
    app.post("/:id/archive", archiveProjectHandler)
    app.post("/:id/restore", restoreProjectHandler)
    app.delete("/:id", deleteProjectHandler)
}