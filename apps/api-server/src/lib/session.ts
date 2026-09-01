import { fromNodeHeaders } from "better-auth/node"
import type { FastifyReply, FastifyRequest } from "fastify"
import { auth } from "./auth.js"

export async function getSession(request: FastifyRequest) {
    return auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
}

export async function requireSession(request: FastifyRequest, reply: FastifyReply) {
    const session = await getSession(request)
    if (!session) {
        reply.status(401).send({ error: "Not authenticated" })
        return null
    }
    return session
}
