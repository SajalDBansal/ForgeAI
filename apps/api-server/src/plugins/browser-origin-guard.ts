import fp from "fastify-plugin"
import type { FastifyReply, FastifyRequest } from "fastify"
import { CSRF_BLOCK_CODE, csrfOriginFailureReason } from "@forgeAI/shared"

import { ENV_CONFIG } from "../lib/envConfig.js"

const ALLOWED_BROWSER_ORIGINS = [
  ENV_CONFIG.CLIENT_ORIGIN,
  ENV_CONFIG.BETTER_AUTH_URL,
]

export function browserOriginFailureReason(
  request: Pick<FastifyRequest, "method" | "headers">,
): string | null {
  return csrfOriginFailureReason({
    method: request.method,
    origin: request.headers.origin,
    referer: request.headers.referer,
    cookie: request.headers.cookie,
    secFetchSite: request.headers["sec-fetch-site"],
    allowedOrigins: ALLOWED_BROWSER_ORIGINS,
  })
}

async function guardBrowserOrigin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const reason = browserOriginFailureReason(request)
  if (!reason) return

  await reply.status(403).send({
    error: "Cross-site request blocked.",
    code: CSRF_BLOCK_CODE,
  })
}

export default fp(async (fastify) => {
  fastify.addHook("preHandler", guardBrowserOrigin)
})
