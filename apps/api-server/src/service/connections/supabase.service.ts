import { prisma } from "@forgeAI/database"
import { encrypt } from "../../lib/encryption.js"

// Deletes the user's Supabase connection.
// Returns false when there was none.
export async function revokeSupabaseConnection(
  userId: string,
): Promise<boolean> {
  const deleted = await prisma.connection
    .delete({ where: { userId_provider: { userId, provider: "SUPABASE" } } })
    .catch(() => null)
  return deleted !== null
}

// Saves (or refreshes) the user's Supabase connection with encrypted tokens.
// Called from the Supabase OAuth callback.
export async function upsertSupabaseConnection(params: {
  userId: string
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  accountId: string
  accountLogin: string
}): Promise<void> {
  await prisma.connection.upsert({
    where: { userId_provider: { userId: params.userId, provider: "SUPABASE" } },
    create: {
      userId: params.userId,
      createdByUserId: params.userId,
      provider: "SUPABASE",
      status: "CONNECTED",
      externalAccountId: params.accountId,
      externalAccountLogin: params.accountLogin,
      accessTokenEnc: encrypt(params.accessToken),
      refreshTokenEnc: params.refreshToken
        ? encrypt(params.refreshToken)
        : null,
      expiresAt: params.expiresAt ?? null,
      scopes: [],
      settingsJson: {},
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
    },
  })
}
