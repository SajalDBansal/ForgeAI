import type { FastifyReply, FastifyRequest } from "fastify"

import { requireSession } from "../lib/session.js"
import { getProjectsMetadata } from "../service/metadata.service.js"

export async function getAppMetadataHandler(request: FastifyRequest, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    return getProjectsMetadata(session.user.id)
}
