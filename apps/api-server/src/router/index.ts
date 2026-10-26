import { FastifyInstance } from "fastify"
import { authRouter } from "./auth.router.js"
import { collaboratorRouter } from "./collaborator.router.js"
import { healthRouter } from "./health.router.js"
import { inviteRouter } from "./invite.router.js"
import { metadataRouter } from "./metadata.router.js"
import { projectRouter } from "./project.router.js"
import { previewRouter } from "./preview.router.js"
import { templateRouter } from "./template.router.js"
import { usageRouter } from "./usage.router.js"
import { workspaceRouter } from "./workspace.router.js"
import { connectionsRouter } from "./connections/index.js"
import { internalRouter } from "./internal.router.js"

// Registers every v1 route group under its prefix.
// Mounted at /api/v1 by server.ts.
export async function v1Routers(app: FastifyInstance): Promise<void> {
  await app.register(authRouter, { prefix: "/auth" })
  await app.register(collaboratorRouter, { prefix: "/collaborator" })
  await app.register(healthRouter, { prefix: "/health" })
  await app.register(inviteRouter, { prefix: "/invite" })
  await app.register(metadataRouter, { prefix: "/metadata" })
  await app.register(previewRouter, { prefix: "/preview" })
  await app.register(projectRouter, { prefix: "/project" })
  await app.register(templateRouter, { prefix: "/template" })
  await app.register(usageRouter, { prefix: "/usage" })
  await app.register(workspaceRouter, { prefix: "/workspace" })
  await app.register(connectionsRouter, { prefix: "/connections" })
  // ForgeAI's own services only (INTERNAL_API_TOKEN), never a browser.
  await app.register(internalRouter, { prefix: "/internal" })
}
