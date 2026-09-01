import { FastifyReply, FastifyRequest } from "fastify"
import { requireSession } from "../lib/session.js"
import { getTemplateDetail, listTemplates } from "../service/template.service.js"

interface TemplateParams {
    id: string
}

export async function listTemplatesHandler(request: FastifyRequest, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    return listTemplates(session.user.id)
}

export async function getTemplateHandler(request: FastifyRequest<{ Params: TemplateParams }>, reply: FastifyReply) {
    const session = await requireSession(request, reply)
    if (!session) return

    const result = await getTemplateDetail(session.user.id, request.params.id)
    if (!result.ok) {
        if (result.reason === "invalid_metadata") {
            request.log.error({ templateId: request.params.id }, "template metadata failed validation")
            return reply.status(500).send({ error: "This template is misconfigured" })
        }
        return reply.status(404).send({ error: "Template not found" })
    }
    return result.template
}
