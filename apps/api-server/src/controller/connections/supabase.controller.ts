import { FastifyReply, FastifyRequest } from "fastify"
import { requireSession } from "../../lib/session.js"
import {
  cached,
  cacheKeys,
  CONNECTION_CACHE_TTL_SECONDS,
  invalidateCache,
} from "../../lib/cache.js"
import {
  getConnection,
  signConnectState,
  verifyConnectState,
} from "../../service/connections/index.js"
import { decrypt } from "../../lib/encryption.js"
import {
  createPkcePair,
  exchangeCodeForToken,
  getAuthorizedOrganization,
  getAuthorizeUrl,
  listOrganizationProjects,
} from "../../lib/connections/supabase.js"
import { ENV_CONFIG } from "../../lib/envConfig.js"
import {
  revokeSupabaseConnection,
  upsertSupabaseConnection,
} from "../../service/connections/supabase.service.js"
import { RATE_LIMITS, withinLimit } from "../../lib/rate-limit.js"

// Returns the Supabase OAuth redirect URI registered for this API.
// Must match exactly when exchanging the code.
function callbackUrl(): string {
  return `${ENV_CONFIG.BETTER_AUTH_URL}/api/v1/connections/supabase/callback`
}

// GET /connections/supabase: the connected organization and its projects.
// Backs the Supabase connection card.
export async function supabaseDetailsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const connection = await getConnection(session.user.id, "SUPABASE")
  if (!connection || !connection.accessTokenEnc) {
    return reply.status(404).send({ error: "No Supabase connection found" })
  }

  const accessToken = decrypt(connection.accessTokenEnc)
  const projects = await cached(
    cacheKeys.connection("supabase", session.user.id),
    CONNECTION_CACHE_TTL_SECONDS,
    () => listOrganizationProjects(accessToken),
  )

  return {
    organizationId: connection.externalAccountId,
    organizationName: connection.externalAccountLogin,
    connectedAt: connection.updatedAt,
    projects,
  }
}

// GET /connections/supabase/start: redirects to Supabase OAuth with a PKCE challenge.
// The verifier rides inside the signed state.
export async function supabaseStartHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  if (
    !(await withinLimit(
      reply,
      RATE_LIMITS.connectionStart,
      `${session.user.id}:supabase:start`,
    ))
  )
    return

  const { verifier, challenge } = createPkcePair()
  const state = signConnectState(session.user.id, "supabase", verifier)
  return reply.redirect(getAuthorizeUrl(state, challenge, callbackUrl()))
}

interface SupabaseCallbackQuery {
  code?: string
  state?: string
}

// GET /connections/supabase/callback: exchanges the code (with PKCE) and saves the connection.
// Public (Supabase redirects here); always ends by redirecting back to /connections.
export async function supabaseCallbackHandler(
  request: FastifyRequest<{ Querystring: SupabaseCallbackQuery }>,
  reply: FastifyReply,
) {
  const { code, state } = request.query
  const redirectTo = `${ENV_CONFIG.CLIENT_ORIGIN}/connections`

  if (!code || !state) {
    return reply.redirect(`${redirectTo}?error=supabase_install_cancelled`)
  }

  const verified = verifyConnectState(state, "supabase")
  if (!verified) {
    return reply.redirect(`${redirectTo}?error=invalid_state`)
  }

  try {
    const token = await exchangeCodeForToken(
      code,
      callbackUrl(),
      verified.extra,
    )
    const org = await getAuthorizedOrganization(token.access_token)

    await upsertSupabaseConnection({
      userId: verified.userId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : undefined,
      accountId: org.id,
      accountLogin: org.name,
    })
    await invalidateCache(cacheKeys.connection("supabase", verified.userId))
    return reply.redirect(`${redirectTo}?connected=supabase`)
  } catch (error) {
    request.log.error(error, "Supabase connection callback failed")
    return reply.redirect(`${redirectTo}?error=supabase_connect_failed`)
  }
}

// DELETE /connections/supabase: removes the connection.
// 404 when there was nothing to disconnect.
export async function disconnectSupabaseHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const disconnected = await revokeSupabaseConnection(session.user.id)
  if (!disconnected) {
    return reply.status(404).send({ error: "No Supabase connection found" })
  }
  await invalidateCache(cacheKeys.connection("supabase", session.user.id))
  return reply.status(204).send()
}
