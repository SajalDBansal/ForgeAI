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
  exchangeUserCode,
  canAccessInstallation,
  getAuthorizeUrl,
  getInstallation,
  getInstallUrl,
  isGithubAppConfigured,
  isGithubUserAuthConfigured,
  listInstallationRepos,
} from "../../lib/connections/github.js"
import { ENV_CONFIG } from "../../lib/envConfig.js"
import {
  revokeGithubConnection,
  githubUserToken,
  storeGithubUserTokens,
  upsertGithubConnection,
  type GithubConnectionSettings,
} from "../../service/connections/github.service.js"
import { RATE_LIMITS, withinLimit } from "../../lib/rate-limit.js"

// GET /connections/github: the connected account, its repos, and whether repos can be created.
// Backs the GitHub connection card.
export async function githubDetailsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const connection = await getConnection(session.user.id, "GITHUB")
  if (!connection) {
    return reply.status(404).send({ error: "No GitHub connection found" })
  }

  const settings = connection.settingsJson as { installationId?: number }
  if (!settings?.installationId) {
    return reply
      .status(500)
      .send({ error: "GitHub connection is missing its installation id" })
  }

  const installationId = String(settings.installationId)
  const userToken = await githubUserToken(connection)
  if (!userToken)
    return reply
      .status(409)
      .send({ error: "Authorize GitHub again to view its repositories." })
  // Only the GitHub-derived part is cached; `connectedAt` and `canCreateRepos` stay live from the DB read above.
  const { account, repos } = await cached(
    cacheKeys.connection("github", session.user.id),
    CONNECTION_CACHE_TTL_SECONDS,
    async () => {
      const [account, repos] = await Promise.all([
        getInstallation(installationId),
        listInstallationRepos(installationId, userToken),
      ])
      return { account, repos }
    },
  )

  return {
    login: account.login,
    avatarUrl: account.avatarUrl,
    accountType: account.accountType,
    connectedAt: connection.updatedAt,
    repos,
    canCreateRepos: Boolean(
      connection.accessTokenEnc &&
      (settings as GithubConnectionSettings).userLogin,
    ),
  }
}

// GET /connections/github/authorize: asks GitHub to let the App act as this user.
// For accounts connected earlier, or whose authorization lapsed.
export async function githubAuthorizeHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  if (
    !(await withinLimit(
      reply,
      RATE_LIMITS.connectionStart,
      `${session.user.id}:github:authorize`,
    ))
  )
    return

  if (!isGithubUserAuthConfigured()) {
    return reply.status(500).send({
      error: "GitHub repository creation is not configured on the server",
    })
  }
  return reply.redirect(
    getAuthorizeUrl(signConnectState(session.user.id, "github")),
  )
}

// GET /connections/github/start: redirects to the GitHub App install screen.
// First step of connecting GitHub.
export async function githubStartHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return
  if (
    !(await withinLimit(
      reply,
      RATE_LIMITS.connectionStart,
      `${session.user.id}:github:start`,
    ))
  )
    return

  if (!isGithubAppConfigured()) {
    return reply
      .status(500)
      .send({ error: "GitHub App is not configured on the server" })
  }

  const state = signConnectState(session.user.id, "github")
  return reply.redirect(getInstallUrl(state))
}

interface GithubCallbackQuery {
  installation_id?: string
  setup_action?: string
  state?: string
  /** From user authorization: exchanged for a user token. */
  code?: string
}

// GET /connections/github/callback: handles an App install and/or user authorization.
// Public (GitHub redirects here); always ends by redirecting back to /connections.
export async function githubCallbackHandler(
  request: FastifyRequest<{ Querystring: GithubCallbackQuery }>,
  reply: FastifyReply,
) {
  const {
    installation_id: installationId,
    setup_action: setupAction,
    state,
    code,
  } = request.query
  const redirectTo = `${ENV_CONFIG.CLIENT_ORIGIN}/connections`

  // Arrives with `installation_id` (install), `code` (user authorization), or both.
  if (!state || (!installationId && !code)) {
    return reply.redirect(`${redirectTo}?error=github_install_cancelled`)
  }
  if (installationId && setupAction !== "install" && setupAction !== "update") {
    return reply.redirect(`${redirectTo}?error=github_install_cancelled`)
  }

  const verified = verifyConnectState(state, "github")
  if (!verified) {
    return reply.redirect(`${redirectTo}?error=invalid_state`)
  }

  try {
    if (!isGithubUserAuthConfigured())
      return reply.redirect(`${redirectTo}?error=github_connect_failed`)
    if (installationId && !/^\d+$/.test(installationId))
      return reply.redirect(`${redirectTo}?error=github_connect_failed`)
    if (!code) {
      // Carry the candidate through signed state; do not grant access before user authorization.
      return reply.redirect(
        getAuthorizeUrl(
          signConnectState(verified.userId, "github", installationId),
        ),
      )
    }

    const existing = await getConnection(verified.userId, "GITHUB")
    const settings = existing?.settingsJson as GithubConnectionSettings | null
    const candidate =
      installationId || verified.extra || String(settings?.installationId ?? "")
    const tokens = await exchangeUserCode(code)
    if (
      !/^\d+$/.test(candidate) ||
      !(await canAccessInstallation(tokens.accessToken, candidate))
    ) {
      return reply.redirect(`${redirectTo}?error=github_connect_failed`)
    }
    const installation = await getInstallation(candidate)
    await upsertGithubConnection({
      userId: verified.userId,
      installationId: Number(candidate),
      accountId: installation.accountId,
      accountLogin: installation.login,
    })
    const stored = await storeGithubUserTokens(verified.userId, tokens)
    if (!stored)
      return reply.redirect(`${redirectTo}?error=github_connect_failed`)

    await invalidateCache(cacheKeys.connection("github", verified.userId))
    return reply.redirect(`${redirectTo}?connected=github`)
  } catch (error) {
    request.log.error(error, "GitHub connection callback failed")
    return reply.redirect(`${redirectTo}?error=github_connect_failed`)
  }
}

// DELETE /connections/github: disconnects this user without uninstalling the shared App.
// 404 when there was nothing to disconnect.
export async function disconnectGithubHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await requireSession(request, reply)
  if (!session) return

  const disconnected = await revokeGithubConnection(session.user.id)
  if (!disconnected) {
    return reply.status(404).send({ error: "No GitHub connection found" })
  }
  await invalidateCache(cacheKeys.connection("github", session.user.id))
  return reply.status(204).send()
}
