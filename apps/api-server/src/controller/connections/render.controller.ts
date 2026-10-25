import { FastifyReply, FastifyRequest } from "fastify"
import { requireSession } from "../../lib/session.js"
import {
  cached,
  cacheKeys,
  CONNECTION_CACHE_TTL_SECONDS,
  invalidateCache,
} from "../../lib/cache.js"
import { getConnection } from "../../service/connections/index.js"
import { decrypt } from "../../lib/encryption.js"
import { listOwnerServices } from "../../lib/connections/render.js"
import {
  revokeRenderConnection,
  upsertRenderConnection,
  validateApiKey,
} from "../../service/connections/render.service.js"
import { RATE_LIMITS, withinLimit } from "../../lib/rate-limit.js"

// GET /connections/render: the connected Render workspace and its services.
// Backs the Render connection card.
export async function renderDetailsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const connection = await getConnection(session.user.id, "RENDER")
  if (!connection || !connection.accessTokenEnc) {
    return reply.status(404).send({ error: "No Render connection found" })
  }

  const settings = connection.settingsJson as { ownerId?: string }
  if (!settings?.ownerId) {
    return reply
      .status(500)
      .send({ error: "Render connection is missing its workspace id" })
  }

  const apiKey = decrypt(connection.accessTokenEnc)
  const ownerId = settings.ownerId
  const services = await cached(
    cacheKeys.connection("render", session.user.id),
    CONNECTION_CACHE_TTL_SECONDS,
    () => listOwnerServices(apiKey, ownerId),
  )

  return {
    ownerName: connection.externalAccountLogin,
    connectedAt: connection.updatedAt,
    services,
  }
}

interface ConnectRenderBody {
  apiKey?: string
}

// POST /connections/render: validates a pasted API key and saves it.
// Render has no OAuth, so the key comes straight from the user.
export async function connectRenderHandler(
  request: FastifyRequest<{ Body: ConnectRenderBody }>,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  if (
    !(await withinLimit(
      reply,
      RATE_LIMITS.connectionCredential,
      `${session.user.id}:render`,
    ))
  )
    return

  const apiKey = request.body?.apiKey?.trim()
  if (!apiKey) {
    return reply.status(400).send({ error: "apiKey is required" })
  }

  try {
    const owner = await validateApiKey(apiKey)
    await upsertRenderConnection({
      userId: session.user.id,
      apiKey,
      ownerId: owner.id,
      ownerName: owner.name,
    })
    await invalidateCache(cacheKeys.connection("render", session.user.id))
    return { connected: true, ownerName: owner.name }
  } catch (error) {
    request.log.error(error, "Render connection failed")
    return reply
      .status(400)
      .send({ error: "Could not verify that Render API key" })
  }
}

// DELETE /connections/render: removes the connection.
// 404 when there was nothing to disconnect.
export async function disconnectRenderHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const disconnected = await revokeRenderConnection(session.user.id)
  if (!disconnected) {
    return reply.status(404).send({ error: "No Render connection found" })
  }
  await invalidateCache(cacheKeys.connection("render", session.user.id))
  return reply.status(204).send()
}
