import { FastifyInstance } from "fastify"
import {
  disconnectVercelHandler,
  vercelCallbackHandler,
  vercelDetailsHandler,
  vercelStartHandler,
} from "../../controller/connections/vercel.controller.js"

// Registers Vercel integration start, callback, details and disconnect routes.
// Mounted under /connections/vercel.
export async function vercelRouter(app: FastifyInstance): Promise<void> {
  // Account and accessible projects for the user's Vercel connection.
  app.get("/", vercelDetailsHandler)

  // Redirects to Vercel's integration install screen.
  app.get("/start", vercelStartHandler)

  // Public: Vercel redirects the browser here.
  app.get("/callback", vercelCallbackHandler)

  app.delete("/", disconnectVercelHandler)
}
