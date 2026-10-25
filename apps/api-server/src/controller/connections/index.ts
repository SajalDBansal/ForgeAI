import { FastifyReply, FastifyRequest } from "fastify"
import { requireSession } from "../../lib/session.js"
import { listConnections } from "../../service/connections/index.js"

// GET /connections: lists the user's provider connections (no secrets).
// Backs Settings -> Connections.
export async function listConnectionHandlers(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  return listConnections(session.user.id)
}

export * from "./github.controller.js"
export * from "./render.controller.js"
export * from "./supabase.controller.js"
export * from "./vercel.controller.js"
