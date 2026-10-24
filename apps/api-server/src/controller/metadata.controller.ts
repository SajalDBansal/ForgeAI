import type { FastifyReply, FastifyRequest } from "fastify"

import { requireSession } from "../lib/session.js"
import { cached, cacheKeys, METADATA_CACHE_TTL_SECONDS } from "../lib/cache.js"
import { getProjectsMetadata } from "../service/metadata.service.js"

// GET /metadata/user: returns the signed-in user's workspaces, projects and collaborators.
// The first call the web app makes after sign-in; short-TTL cached since it fans out to 3 queries.
export async function getAppMetadataHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  return cached(
    cacheKeys.metadata(session.user.id),
    METADATA_CACHE_TTL_SECONDS,
    () => getProjectsMetadata(session.user.id),
  )
}
