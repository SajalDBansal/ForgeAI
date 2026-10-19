import { prisma } from "@forgeAI/database"
import { decrypt, encrypt } from "../../lib/encryption.js"
import { removeIntegrationConfiguration } from "../../lib/connections/vercel.js"

// Saves (or refreshes) the user's Vercel connection with encrypted tokens.
// Keeps the installation id (to revoke later) and team id (to scope API calls).
export async function upsertVercelConnection(params: {
  userId: string
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  installationId: string
  teamId: string | null
  accountId: string
  accountLogin: string
}): Promise<void> {
  await prisma.connection.upsert({
    where: { userId_provider: { userId: params.userId, provider: "VERCEL" } },
    create: {
      userId: params.userId,
      createdByUserId: params.userId,
      provider: "VERCEL",
      status: "CONNECTED",
      externalAccountId: params.accountId,
      externalAccountLogin: params.accountLogin,
      accessTokenEnc: encrypt(params.accessToken),
      refreshTokenEnc: params.refreshToken
        ? encrypt(params.refreshToken)
        : null,
      expiresAt: params.expiresAt ?? null,
      scopes: [],
      settingsJson: {
        installationId: params.installationId,
        teamId: params.teamId,
      },
    },
    update: {
      status: "CONNECTED",
      externalAccountId: params.accountId,
      externalAccountLogin: params.accountLogin,
      accessTokenEnc: encrypt(params.accessToken),
      refreshTokenEnc: params.refreshToken
        ? encrypt(params.refreshToken)
        : null,
      expiresAt: params.expiresAt ?? null,
      settingsJson: {
        installationId: params.installationId,
        teamId: params.teamId,
      },
    },
  })
}

// Removes the integration from Vercel (best effort) and deletes the connection.
// Returns false when there was no connection.
export async function revokeVercelConnection(userId: string): Promise<boolean> {
  const connection = await prisma.connection.findUnique({
    where: { userId_provider: { userId, provider: "VERCEL" } },
  })
  if (!connection) {
    return false
  }

  const settings = connection.settingsJson as { installationId?: string }
  if (settings?.installationId && connection.accessTokenEnc) {
    await removeIntegrationConfiguration(
      settings.installationId,
      decrypt(connection.accessTokenEnc),
    ).catch((error: unknown) => {
      console.error(
        "Failed to remove Vercel integration configuration remotely (continuing anyway):",
        error,
      )
    })
  }

  await prisma.connection.delete({ where: { id: connection.id } })
  return true
}
