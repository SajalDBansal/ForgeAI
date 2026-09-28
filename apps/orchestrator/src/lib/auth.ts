import { createHash, timingSafeEqual } from "node:crypto"
import type { FastifyReply, FastifyRequest } from "fastify"
import { ENV_CONFIG } from "../envConfig.js"

// Only api-server may call this service. Tokens are hashed so the comparison is constant-time.
const expected = createHash("sha256")
  .update(ENV_CONFIG.ORCHESTRATOR_TOKEN)
  .digest()

/** The only paths open without the token: Kubernetes probes can't send a secret, and these reveal nothing. */
const PROBE_PATHS = new Set(["/healthz", "/readyz"])

// Rejects any request without the shared api-server bearer token, except the two probes.
// Registered as an onRequest hook for every route.
export async function requireServiceToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (request.method === "GET" && PROBE_PATHS.has(request.url.split("?")[0]!))
    return

  const header = request.headers.authorization
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : ""
  const given = createHash("sha256").update(token).digest()

  if (!token || !timingSafeEqual(given, expected)) {
    request.log.warn(
      { ip: request.ip, url: request.url },
      "orchestrator request refused: bad service token",
    )
    await reply.code(401).send({ error: "Unauthorized" })
  }
}
