import { FastifyReply, FastifyRequest } from "fastify"
import { requireSession } from "../lib/session.js"
import { cached, cacheKeys, TEMPLATE_CACHE_TTL_SECONDS } from "../lib/cache.js"
import {
  getTemplateDetail,
  getTemplateDownload,
  listTemplates,
} from "../service/template.service.js"

interface TemplateParams {
  id: string
}

// GET /template: lists templates visible to the user.
// Backs the templates gallery; cached since templates only change through the sync pipeline.
export async function listTemplatesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  return cached(
    cacheKeys.templateList(session.user.id),
    TEMPLATE_CACHE_TTL_SECONDS,
    () => listTemplates(session.user.id),
  )
}

// GET /template/:id: returns one template's full details.
// A 500 means the template's stored metadata is misconfigured.
export async function getTemplateHandler(
  request: FastifyRequest<{ Params: TemplateParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await cached(
    cacheKeys.templateDetail(session.user.id, request.params.id),
    TEMPLATE_CACHE_TTL_SECONDS,
    () => getTemplateDetail(session.user.id, request.params.id),
  )
  if (!result.ok) {
    if (result.reason === "invalid_metadata") {
      request.log.error(
        { templateId: request.params.id },
        "template metadata failed validation",
      )
      return reply.status(500).send({ error: "This template is misconfigured" })
    }
    return reply.status(404).send({ error: "Template not found" })
  }
  return result.template
}

// GET /template/:id/download: returns a short-lived download link, not the file.
// The browser fetches the zip from R2 itself.
export async function getTemplateDownloadHandler(
  request: FastifyRequest<{ Params: TemplateParams }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const result = await getTemplateDownload(session.user.id, request.params.id)
  if (!result.ok) return reply.status(404).send({ error: "Template not found" })
  return result.download
}
