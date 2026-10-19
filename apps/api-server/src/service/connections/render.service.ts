import { prisma } from "@forgeAI/database"
import { encrypt } from "../../lib/encryption.js"

// Deletes the user's Render connection.
// Returns false when there was none.
export async function revokeRenderConnection(userId: string): Promise<boolean> {
  const deleted = await prisma.connection
    .delete({ where: { userId_provider: { userId, provider: "RENDER" } } })
    .catch(() => null)
  return deleted !== null
}

interface RenderOwner {
  id: string
  name: string
  email: string
  type: string
}

// Checks a pasted Render API key by fetching its first owner (workspace).
// Throws with a clear message when the key is invalid or has no workspace.
export async function validateApiKey(apiKey: string): Promise<RenderOwner> {
  const response = await fetch("https://api.render.com/v1/owners?limit=1", {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) {
    throw new Error(
      `Invalid Render API key: ${response.status} ${await response.text()}`,
    )
  }

  const data = (await response.json()) as Array<{ owner: RenderOwner }>
  const owner = data[0]?.owner
  if (!owner) {
    throw new Error("Render API key has no accessible workspace")
  }
  return owner
}

// Saves (or refreshes) the user's Render connection with the encrypted API key.
// Render keys don't expire, so there's no refresh token.
export async function upsertRenderConnection(params: {
  userId: string
  apiKey: string
  ownerId: string
  ownerName: string
}): Promise<void> {
  await prisma.connection.upsert({
    where: { userId_provider: { userId: params.userId, provider: "RENDER" } },
    create: {
      userId: params.userId,
      createdByUserId: params.userId,
      provider: "RENDER",
      status: "CONNECTED",
      externalAccountId: params.ownerId,
      externalAccountLogin: params.ownerName,
      accessTokenEnc: encrypt(params.apiKey),
      scopes: [],
      settingsJson: { ownerId: params.ownerId },
    },
    update: {
      status: "CONNECTED",
      externalAccountId: params.ownerId,
      externalAccountLogin: params.ownerName,
      accessTokenEnc: encrypt(params.apiKey),
      settingsJson: { ownerId: params.ownerId },
    },
  })
}
