import { createHash, randomBytes } from "node:crypto"
import { ENV_CONFIG } from "../envConfig.js"

export interface SupabaseProject {
  id: string
  name: string
  region: string
  status: string
  createdAt: string
}

// Lists the Supabase projects the token can see.
// Shown on the Supabase connection card.
export async function listOrganizationProjects(
  accessToken: string,
): Promise<SupabaseProject[]> {
  const response = await fetch("https://api.supabase.com/v1/projects", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error(
      `Failed to list Supabase projects: ${response.status} ${await response.text()}`,
    )
  }

  const data = (await response.json()) as Array<{
    id: string
    name: string
    region: string
    status: string
    created_at: string
  }>
  return data.map((p) => ({
    id: p.id,
    name: p.name,
    region: p.region,
    status: p.status,
    createdAt: p.created_at,
  }))
}

// Creates a PKCE verifier and its S256 challenge.
// Supabase OAuth requires PKCE.
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { verifier, challenge }
}

// Builds the Supabase OAuth authorize URL with PKCE and state.
// Where "Connect Supabase" sends the browser.
export function getAuthorizeUrl(
  state: string,
  codeChallenge: string,
  redirectUri: string,
): string {
  if (!ENV_CONFIG.SUPABASE_CLIENT_ID) {
    throw new Error(
      "Supabase OAuth App is not configured (SUPABASE_CLIENT_ID missing)",
    )
  }

  const url = new URL("https://api.supabase.com/v1/oauth/authorize")
  url.searchParams.set("client_id", ENV_CONFIG.SUPABASE_CLIENT_ID)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  return url.toString()
}

interface SupabaseTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
}

// Exchanges the Supabase OAuth code (plus PKCE verifier) for tokens.
// Called from the Supabase callback.
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<SupabaseTokenResponse> {
  if (!ENV_CONFIG.SUPABASE_CLIENT_ID || !ENV_CONFIG.SUPABASE_CLIENT_SECRET) {
    throw new Error(
      "Supabase OAuth App is not configured (SUPABASE_CLIENT_ID / SUPABASE_CLIENT_SECRET missing)",
    )
  }

  const basicAuth = Buffer.from(
    `${ENV_CONFIG.SUPABASE_CLIENT_ID}:${ENV_CONFIG.SUPABASE_CLIENT_SECRET}`,
  ).toString("base64")

  const response = await fetch("https://api.supabase.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  })
  if (!response.ok) {
    throw new Error(
      `Failed to exchange Supabase OAuth code: ${response.status} ${await response.text()}`,
    )
  }

  return (await response.json()) as SupabaseTokenResponse
}

// Returns the organization the Supabase grant was made for.
// Used to label the connection after OAuth.
export async function getAuthorizedOrganization(
  accessToken: string,
): Promise<{ id: string; name: string }> {
  const response = await fetch("https://api.supabase.com/v1/organizations", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error(
      `Failed to look up Supabase organization: ${response.status} ${await response.text()}`,
    )
  }

  const orgs = (await response.json()) as Array<{ id: string; name: string }>
  const org = orgs[0]
  if (!org) {
    throw new Error("Supabase OAuth grant returned no organizations")
  }
  return org
}
