import { fromNodeHeaders } from "better-auth/node"
import type { FastifyReply, FastifyRequest } from "fastify"
import { auth } from "./auth.js"

// Reads the better-auth session from the request cookies.
// Returns null when the caller isn't signed in.
export async function getSession(request: FastifyRequest) {
  return auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
}

// Returns the session, or sends a 401 and returns null.
// Called at the top of every authenticated controller.
export async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await getSession(request)
  if (!session) {
    reply.status(401).send({ error: "Not authenticated" })
    return null
  }
  return session
}
