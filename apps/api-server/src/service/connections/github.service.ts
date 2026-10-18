import { prisma, type Connection } from "@forgeAI/database"
import {
  getTokenUser,
  refreshUserTokens,
  type GithubUserTokens,
} from "../../lib/connections/github.js"
import { decrypt, encrypt } from "../../lib/encryption.js"

// Saves (or refreshes) the user's GitHub App installation as their GitHub connection.
// Merges settings so an existing user token survives a re-install.
export async function upsertGithubConnection(params: {
  userId: string
  installationId: number
  accountId: number
  accountLogin: string
}): Promise<void> {
  const existing = await prisma.connection.findUnique({
    where: { userId_provider: { userId: params.userId, provider: "GITHUB" } },
    select: { settingsJson: true },
  })
  await prisma.connection.upsert({
    where: { userId_provider: { userId: params.userId, provider: "GITHUB" } },
    create: {
      userId: params.userId,
      createdByUserId: params.userId,
      provider: "GITHUB",
      status: "CONNECTED",
      externalAccountId: String(params.accountId),
      externalAccountLogin: params.accountLogin,
      scopes: [],
      // The installation id is the credential handle for GitHub (see lib/connections/github.ts).
      settingsJson: { installationId: params.installationId },
    },
    update: {
      status: "CONNECTED",
      externalAccountId: String(params.accountId),
      externalAccountLogin: params.accountLogin,
      settingsJson: {
        ...(existing?.settingsJson as object | null),
        installationId: params.installationId,
      },
    },
  })
}

// Disconnect only this user; uninstalling a shared App would break other organization members.
// Returns false when there was no connection.
export async function revokeGithubConnection(userId: string): Promise<boolean> {
  const connection = await prisma.connection.findUnique({
    where: { userId_provider: { userId, provider: "GITHUB" } },
  })
  if (!connection) {
    return false
  }

  await prisma.connection.delete({ where: { id: connection.id } })
  return true
}

/** What a GitHub connection keeps in `settingsJson`, beside the encrypted tokens. */
export interface GithubConnectionSettings {
  installationId?: number
  /** The person who authorized the App (commit author); differs from the account for org installs. */
  userId?: number
  userLogin?: string
  refreshExpiresAt?: string
}

// Stores the user's encrypted GitHub tokens and whose they are on the connection.
// Leaves the installation alone; the two arrive separately in either order.
export async function storeGithubUserTokens(
  userId: string,
  tokens: GithubUserTokens,
): Promise<boolean> {
  const connection = await prisma.connection.findUnique({
    where: { userId_provider: { userId, provider: "GITHUB" } },
  })
  if (!connection) return false

  const who = await getTokenUser(tokens.accessToken)
  const settings = (connection.settingsJson ?? {}) as GithubConnectionSettings
  await prisma.connection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encrypt(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken
        ? encrypt(tokens.refreshToken)
        : null,
      expiresAt: tokens.expiresAt ?? null,
      settingsJson: {
        ...settings,
        userId: who.id,
        userLogin: who.login,
        ...(tokens.refreshExpiresAt && {
          refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
        }),
      },
    },
  })
  return true
}

// Returns a working user token, refreshing it first if it has expired.
// Null when there's none or it can't be refreshed, so the user must re-authorize.
export async function githubUserToken(
  connection: Connection,
): Promise<string | null> {
  if (!connection.accessTokenEnc) return null
  const fresh =
    !connection.expiresAt ||
    connection.expiresAt.getTime() > Date.now() + 60_000
  if (fresh) return decrypt(connection.accessTokenEnc)
  if (!connection.refreshTokenEnc) return null

  try {
    const tokens = await refreshUserTokens(decrypt(connection.refreshTokenEnc))
    await prisma.connection.update({
      where: { id: connection.id },
      data: {
        accessTokenEnc: encrypt(tokens.accessToken),
        refreshTokenEnc: tokens.refreshToken
          ? encrypt(tokens.refreshToken)
          : connection.refreshTokenEnc,
        expiresAt: tokens.expiresAt ?? null,
      },
    })
    return tokens.accessToken
  } catch (error) {
    console.error(
      `[github] couldn't refresh the user token for connection ${connection.id}:`,
      error,
    )
    return null
  }
}
