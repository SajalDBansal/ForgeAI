import { FastifyInstance } from "fastify";
import { authRouter } from "./auth.router.js";
import { healthRouter } from "./health.router.js";
import { inviteRouter } from "./invite.router.js";
import { metadataRouter } from "./metadata.router.js";
import { projectRouter } from "./project.router.js";
import { templateRouter } from "./template.router.js";
import { workspaceRouter } from "./workspace.router.js";

export async function v1Routers(app: FastifyInstance): Promise<void> {
    await app.register(authRouter, { prefix: "/auth" });
    await app.register(healthRouter, { prefix: "/health" });
    await app.register(inviteRouter, { prefix: "/invite" });
    await app.register(metadataRouter, { prefix: "/metadata" });
    await app.register(projectRouter, { prefix: "/project" });
    await app.register(templateRouter, { prefix: "/template" });
    await app.register(workspaceRouter, { prefix: "/workspace" });
}
