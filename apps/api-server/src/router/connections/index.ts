import { FastifyInstance } from "fastify"
import { listConnectionHandlers } from "../../controller/connections/index.js"
import { githubRouter } from "./github.router.js"
import { vercelRouter } from "./vercel.router.js"
import { renderRouter } from "./render.router.js"
import { supabaseRouter } from "./supabase.router.js"

// Registers the connections list and each provider's routes.
// Backs Settings -> Connections.
export async function connectionsRouter(app: FastifyInstance): Promise<void> {
  app.get("/", listConnectionHandlers)
  await app.register(githubRouter, { prefix: "/github" })
  await app.register(vercelRouter, { prefix: "/vercel" })
  await app.register(supabaseRouter, { prefix: "/supabase" })
  await app.register(renderRouter, { prefix: "/render" })
}
