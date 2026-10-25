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
import {
  exchangeCodeForToken,
  getInstallUrl,
  getVercelUser,
  isVercelConfigured,
  listUserProjects,
} from "../../lib/connections/vercel.js"
import { decrypt } from "../../lib/encryption.js"
import { ENV_CONFIG } from "../../lib/envConfig.js"
import {
  revokeVercelConnection,
  upsertVercelConnection,
} from "../../service/connections/vercel.service.js"
import { RATE_LIMITS, withinLimit } from "../../lib/rate-limit.js"

// GET /connections/vercel: the connected Vercel account and its projects.
// Backs the Vercel connection card.
export async function vercelDetailsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const connection = await getConnection(session.user.id, "VERCEL")
  if (!connection || !connection.accessTokenEnc) {
    return reply.status(404).send({ error: "No Vercel connection found" })
  }

  const settings = connection.settingsJson as { teamId?: string | null }
  const accessToken = decrypt(connection.accessTokenEnc)

  const { account, projects } = await cached(
    cacheKeys.connection("vercel", session.user.id),
    CONNECTION_CACHE_TTL_SECONDS,
    async () => {
      const [account, projects] = await Promise.all([
        getVercelUser(accessToken),
        listUserProjects(accessToken, settings?.teamId ?? null),
      ])
      return { account, projects }
    },
  )

  return {
    login: account.username,
    teamId: settings?.teamId ?? null,
    connectedAt: connection.updatedAt,
    projects,
  }
}

// GET /connections/vercel/start: redirects to the Vercel integration install screen.
// First step of connecting Vercel.
export async function vercelStartHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  if (
    !(await withinLimit(
      reply,
      RATE_LIMITS.connectionStart,
      `${session.user.id}:vercel:start`,
    ))
  )
    return

  if (!isVercelConfigured()) {
    return reply
      .status(500)
      .send({ error: "Vercel Integration is not configured on the server" })
  }

  const state = signConnectState(session.user.id, "vercel")
  return reply.redirect(getInstallUrl(state))
}

interface VercelCallbackQuery {
  code?: string
  state?: string
  configurationId?: string
  teamId?: string
}

// Returns the Vercel OAuth redirect URI registered for this API.
// Must match exactly when exchanging the code.
function callbackUrl(): string {
  return `${ENV_CONFIG.BETTER_AUTH_URL}/api/v1/connections/vercel/callback`
}

// GET /connections/vercel/callback: exchanges the code and saves the connection.
// Public (Vercel redirects here); always ends by redirecting back to /connections.
export async function vercelCallbackHandler(
  request: FastifyRequest<{ Querystring: VercelCallbackQuery }>,
  reply: FastifyReply,
) {
  const { code, state, configurationId, teamId } = request.query
  const redirectTo = `${ENV_CONFIG.CLIENT_ORIGIN}/connections`

  if (!code || !state) {
    return reply.redirect(`${redirectTo}?error=vercel_install_cancelled`)
  }

  const verified = verifyConnectState(state, "vercel")
  if (!verified) {
    return reply.redirect(`${redirectTo}?error=invalid_state`)
  }

  try {
    const token = await exchangeCodeForToken(code, callbackUrl())
    const account = await getVercelUser(token.access_token)

    await upsertVercelConnection({
      userId: verified.userId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : undefined,
      installationId: configurationId ?? token.installation_id,
      teamId: teamId ?? token.team_id,
      accountId: account.id,
      accountLogin: account.username,
    })
    await invalidateCache(cacheKeys.connection("vercel", verified.userId))
    return reply.redirect(`${redirectTo}?connected=vercel`)
  } catch (error) {
    request.log.error(error, "Vercel connection callback failed")
    return reply.redirect(`${redirectTo}?error=vercel_connect_failed`)
  }
}

// DELETE /connections/vercel: removes the integration and the connection.
// 404 when there was nothing to disconnect.
export async function disconnectVercelHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const disconnected = await revokeVercelConnection(session.user.id)
  if (!disconnected) {
    return reply.status(404).send({ error: "No Vercel connection found" })
  }
  await invalidateCache(cacheKeys.connection("vercel", session.user.id))
  return reply.status(204).send()
}
