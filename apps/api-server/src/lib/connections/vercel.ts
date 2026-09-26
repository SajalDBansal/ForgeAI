import { ENV_CONFIG } from "../envConfig.js"

// Checks whether the Vercel integration's client and slug are configured.
// Hides the Vercel connection when they aren't.
export function isVercelConfigured(): boolean {
  return Boolean(
    ENV_CONFIG.VERCEL_CLIENT_ID &&
    ENV_CONFIG.VERCEL_CLIENT_SECRET &&
    ENV_CONFIG.CONNECTION_APP_SLUG,
  )
}

// Builds the Vercel integration install URL carrying our signed state.
// Where "Connect Vercel" sends the browser.
export function getInstallUrl(state: string): string {
  if (!ENV_CONFIG.CONNECTION_APP_SLUG) {
    throw new Error(
      "Vercel Integration is not configured (CONNECTION_APP_SLUG missing)",
    )
  }

  const url = new URL(
    `https://vercel.com/integrations/${ENV_CONFIG.CONNECTION_APP_SLUG}/new`,
  )
  url.searchParams.set("state", state)
  return url.toString()
}

// Looks up the Vercel user behind an access token.
// Used to label the connection after OAuth.
export async function getVercelUser(
  accessToken: string,
): Promise<{ id: string; username: string }> {
  const response = await fetch("https://api.vercel.com/v2/user", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error(
      `Failed to look up Vercel user: ${response.status} ${await response.text()}`,
    )
  }

  const data = (await response.json()) as {
    user: { id: string; username: string }
  }
  return { id: data.user.id, username: data.user.username }
}

export interface VercelProject {
  name: string
  framework: string | null
  updatedAt: string
  url: string | null
}

// Lists up to 100 of the user's (or team's) Vercel projects.
// Shown on the Vercel connection card.
export async function listUserProjects(
  accessToken: string,
  teamId?: string | null,
): Promise<VercelProject[]> {
  const url = new URL("https://api.vercel.com/v9/projects")
  url.searchParams.set("limit", "100")
  if (teamId) url.searchParams.set("teamId", teamId)

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error(
      `Failed to list Vercel projects: ${response.status} ${await response.text()}`,
    )
  }

  const data = (await response.json()) as {
    projects: Array<{
      name: string
      framework: string | null
      updatedAt: number
      targets?: { production?: { url?: string } }
    }>
  }
  return data.projects.map((p) => ({
    name: p.name,
    framework: p.framework,
    updatedAt: new Date(p.updatedAt).toISOString(),
    url: p.targets?.production?.url
      ? `https://${p.targets.production.url}`
      : null,
  }))
}

interface VercelTokenResponse {
  access_token: string
  token_type: string
  installation_id: string
  user_id: string
  team_id: string | null
  refresh_token?: string
  expires_in?: number
}

// Exchanges the Vercel OAuth code for an access token.
// Called from the Vercel callback.
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<VercelTokenResponse> {
  if (!ENV_CONFIG.VERCEL_CLIENT_ID || !ENV_CONFIG.VERCEL_CLIENT_SECRET) {
    throw new Error(
      "Vercel Integration is not configured (VERCEL_CLIENT_ID / VERCEL_CLIENT_SECRET missing)",
    )
  }

  const response = await fetch("https://api.vercel.com/v2/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ENV_CONFIG.VERCEL_CLIENT_ID,
      client_secret: ENV_CONFIG.VERCEL_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!response.ok) {
    throw new Error(
      `Failed to exchange Vercel OAuth code: ${response.status} ${await response.text()}`,
    )
  }

  return (await response.json()) as VercelTokenResponse
}

// Removes our integration from the user's Vercel account (404 counts as gone).
// Used when the user disconnects Vercel.
export async function removeIntegrationConfiguration(
  configurationId: string,
  accessToken: string,
): Promise<void> {
  const response = await fetch(
    `https://api.vercel.com/v1/integrations/configuration/${configurationId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Failed to remove Vercel integration configuration ${configurationId}: ${response.status} ${await response.text()}`,
    )
  }
}
