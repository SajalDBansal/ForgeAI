import { Connection, ConnectionProvider, prisma } from "@forgeAI/database"
import { signTicket, verifyTicket } from "@forgeAI/shared"
import { ENV_CONFIG } from "../../lib/envConfig.js"

const STATE_TTL_MS = ENV_CONFIG.CONNECT_STATE_TTL_MS

// Loads the user's connection for one provider, if any.
// Used wherever a provider's stored credentials are needed.
export async function getConnection(
  userId: string,
  provider: ConnectionProvider,
): Promise<Connection | null> {
  return prisma.connection.findUnique({
    where: { userId_provider: { userId, provider } },
  })
}

// Lists the user's connections without any secrets.
// Backs Settings -> Connections.
export async function listConnections(userId: string) {
  return prisma.connection.findMany({
    where: { userId },
    select: {
      provider: true,
      status: true,
      externalAccountLogin: true,
      updatedAt: true,
    },
  })
}

// Signs the OAuth `state` that ties a provider redirect back to this user.
// Uses the shared HMAC ticket format with the provider as its scope.
export function signConnectState(
  userId: string,
  provider: string,
  extra = "",
): string {
  return signTicket(
    ENV_CONFIG.CONNECTION_ENCRYPTION_KEY,
    userId,
    provider,
    extra,
    STATE_TTL_MS,
  )
}

// Verifies a provider callback's `state` and returns the user it was issued for.
// Returns null when it's forged, expired or for a different provider.
export function verifyConnectState(
  state: string,
  provider: string,
): { userId: string; extra: string } | null {
  const verified = verifyTicket(
    ENV_CONFIG.CONNECTION_ENCRYPTION_KEY,
    state,
    provider,
  )
  return verified ? { userId: verified.subject, extra: verified.extra } : null
}
