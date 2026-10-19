import { ENV_CONFIG } from "../envConfig.js"
import { sign } from "node:crypto"

const GITHUB_API = "https://api.github.com"

/** Headers every GitHub REST call sends, apart from auth. */
const GITHUB_JSON_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
} as const

// Encodes bytes or text as unpadded base64url.
// Used to build the App's JWT.
function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

// Builds headers for calls made as the GitHub App itself (JWT auth).
// Used for installation lookups and token minting.
function githubApiHeaders(jwt: string): Record<string, string> {
  return { Authorization: `Bearer ${jwt}`, ...GITHUB_JSON_HEADERS }
}

// Builds headers for calls made with an installation access token.
// Used for listing and looking up repositories.
function installationTokenHeaders(token: string): Record<string, string> {
  return { Authorization: `token ${token}`, ...GITHUB_JSON_HEADERS }
}

// Signs a short-lived JWT that authenticates as the GitHub App.
// Accepts a private key with literal "\n" sequences from env files.
function createAppJwt(): string {
  const appId = ENV_CONFIG.GITHUB_APP_ID
  const githubKey = ENV_CONFIG.GITHUB_APP_PRIVATE_KEY

  const privateKey = githubKey.includes("\\n")
    ? githubKey.replace(/\\n/g, "\n")
    : githubKey

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = base64url(
    // Leave a minute below GitHub's ten-minute ceiling for clock skew.
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }),
  )
  const signature = base64url(
    sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey),
  )

  return `${header}.${payload}.${signature}`
}

interface GithubInstallation {
  accountId: number
  login: string
  avatarUrl: string
  accountType: string
  /** "all" = every repository of the account; "selected" = only the chosen ones. */
  repositorySelection: "all" | "selected"
}

// Looks up which account a GitHub App installation belongs to.
// Used when connecting and when deciding how to create a repo.
export async function getInstallation(
  installationId: string,
): Promise<GithubInstallation> {
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}`,
    {
      signal: AbortSignal.timeout(30_000),
      headers: githubApiHeaders(createAppJwt()),
    },
  )
  if (!response.ok) {
    throw new Error(
      `Failed to look up GitHub installation ${installationId}: ${response.status} ${await response.text()}`,
    )
  }

  const data = (await response.json()) as {
    account: { id: number; login: string; avatar_url: string; type: string }
    repository_selection: "all" | "selected"
  }

  return {
    accountId: data.account.id,
    login: data.account.login,
    avatarUrl: data.account.avatar_url,
    accountType: data.account.type,
    repositorySelection: data.repository_selection,
  }
}

// An App JWT proves the App can see an installation, not that this user can access it.
export async function canAccessInstallation(
  userToken: string,
  installationId: string,
): Promise<boolean> {
  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `${GITHUB_API}/user/installations?per_page=100&page=${page}`,
      {
        headers: installationTokenHeaders(userToken),
      },
    )
    if (!response.ok)
      throw new Error(
        `Failed to verify GitHub installation access: ${response.status}`,
      )
    const data = (await response.json()) as { installations: { id: number }[] }
    if (
      data.installations.some(
        (installation) => String(installation.id) === installationId,
      )
    )
      return true
    if (data.installations.length < 100) return false
  }
}

export interface GithubRepo {
  name: string
  fullName: string
  private: boolean
  defaultBranch: string
  htmlUrl: string
  updatedAt: string
}

type GithubRepoPayload = {
  name: string
  full_name: string
  private: boolean
  default_branch: string
  html_url: string
  updated_at: string
}

// Maps GitHub's repository JSON to our camelCase shape.
// Used when listing an installation's repositories.
function toGithubRepo(r: GithubRepoPayload): GithubRepo {
  return {
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
    htmlUrl: r.html_url,
    updatedAt: r.updated_at,
  }
}

// Mints an installation access token with the installation's full permissions.
// Used for listing repos and anything a scoped token can't do.
export async function mintInstallationToken(
  installationId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: githubApiHeaders(createAppJwt()),
    },
  )
  if (!response.ok) {
    throw new Error(
      `Failed to mint GitHub installation token: ${response.status} ${await response.text()}`,
    )
  }

  const data = (await response.json()) as { token: string; expires_at: string }
  return { token: data.token, expiresAt: new Date(data.expires_at) }
}

// Lists the repositories both this user and the installation can reach, following pagination.
// Backs the repo picker when importing a project.
export async function listInstallationRepos(
  installationId: string,
  userToken: string,
): Promise<GithubRepo[]> {
  const headers = installationTokenHeaders(userToken)

  const repos: GithubRepo[] = []

  for (let page = 1; ; page++) {
    const response = await fetch(
      `${GITHUB_API}/user/installations/${encodeURIComponent(installationId)}/repositories?per_page=100&page=${page}`,
      { headers },
    )
    if (!response.ok) {
      throw new Error(
        `Failed to list installation repositories: ${response.status} ${await response.text()}`,
      )
    }

    const data = (await response.json()) as {
      repositories: GithubRepoPayload[]
    }
    repos.push(...data.repositories.map(toGithubRepo))
    if (data.repositories.length < 100) break
  }

  return repos
}

export interface GithubRepoLookup {
  owner: string
  name: string
  defaultBranch: string
}

// Looks up a repository through the installation; null means missing or not shared with the App.
// Used when creating a project from an existing repo.
export async function getInstallationRepo(
  installationId: string,
  owner: string,
  name: string,
  userToken: string,
): Promise<GithubRepoLookup | null> {
  // A member of an organization may see only some repositories in its installation.
  const allowed = await listInstallationRepos(installationId, userToken)
  if (
    !allowed.some(
      (repo) =>
        repo.fullName.toLowerCase() === `${owner}/${name}`.toLowerCase(),
    )
  )
    return null
  const { token } = await mintInstallationToken(installationId)
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    {
      headers: installationTokenHeaders(token),
    },
  )
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(
      `Failed to look up GitHub repository ${owner}/${name}: ${response.status} ${await response.text()}`,
    )
  }

  const data = (await response.json()) as {
    name: string
    owner: { login: string }
    default_branch: string
  }
  return {
    owner: data.owner.login,
    name: data.name,
    defaultBranch: data.default_branch,
  }
}

// Checks whether the GitHub App's id, key and slug are all configured.
// Hides the GitHub connection when they aren't.
export function isGithubAppConfigured(): boolean {
  return Boolean(
    ENV_CONFIG.GITHUB_APP_ID &&
    ENV_CONFIG.GITHUB_APP_PRIVATE_KEY &&
    ENV_CONFIG.CONNECTION_APP_SLUG,
  )
}

// Builds the GitHub App install URL carrying our signed state.
// Where "Connect GitHub" sends the browser.
export function getInstallUrl(state: string): string {
  if (!ENV_CONFIG.CONNECTION_APP_SLUG) {
    throw new Error(
      "GitHub App is not configured (CONNECTION_APP_SLUG missing)",
    )
  }

  const url = new URL(
    `https://github.com/apps/${ENV_CONFIG.CONNECTION_APP_SLUG}/installations/new`,
  )
  url.searchParams.set("state", state)
  return url.toString()
}

// Uninstalls the App from an account (a 404 counts as already gone).
// Used when the user disconnects GitHub.
export async function uninstallInstallation(
  installationId: string,
): Promise<void> {
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}`,
    {
      method: "DELETE",
      headers: githubApiHeaders(createAppJwt()),
    },
  )
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Failed to uninstall GitHub App installation ${installationId}: ${response.status} ${await response.text()}`,
    )
  }
}

// ---------- ACTING ON REPOSITORIES ----------

/** A failed GitHub API call, keeping the status for callers to branch on. */
export class GithubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

// Makes one GitHub REST call with an installation or user token.
// Throws GithubApiError on failure; a 204 returns undefined.
export async function githubApi<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${token}`,
      ...GITHUB_JSON_HEADERS,
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new GithubApiError(
      response.status,
      `GitHub ${method} ${path} failed: ${response.status} ${text.slice(0, 300)}`,
    )
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

// Mints a one-hour token that can write only this one repository (by id when known, so renames are safe).
// Every push uses it; falls back to no `workflows` permission if the owner hasn't accepted it yet.
export async function mintRepoToken(
  installationId: string,
  repo: { name: string; githubRepoId?: string | null },
): Promise<string> {
  const which = repo.githubRepoId
    ? { repository_ids: [Number(repo.githubRepoId)] }
    : { repositories: [repo.name] }
  const mint = (permissions: Record<string, string>) =>
    fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        ...githubApiHeaders(createAppJwt()),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...which, permissions }),
    })

  // `workflows` lets pushes touch .github/workflows; a 422 means it isn't granted yet.
  let response = await mint({
    contents: "write",
    workflows: "write",
    metadata: "read",
  })
  if (response.status === 422) {
    console.warn(
      `[github] installation ${installationId} hasn't granted "workflows" — pushing without it; ` +
        "changes to .github/workflows will be refused until the owner accepts the App's new permissions",
    )
    response = await mint({ contents: "write", metadata: "read" })
  }
  if (!response.ok) {
    throw new GithubApiError(
      response.status,
      `Failed to mint a token for ${repo.name}: ${response.status} ${await response.text()}`,
    )
  }
  return ((await response.json()) as { token: string }).token
}

// Returns an installation token with full permissions.
// Needed to create a repository in an organization.
export async function mintInstallationWideToken(
  installationId: string,
): Promise<string> {
  return (await mintInstallationToken(installationId)).token
}

// ---------- ACTING AS THE USER ----------

/** A user's token for the ForgeAI GitHub App, as GitHub hands it over. */
export interface GithubUserTokens {
  accessToken: string
  refreshToken?: string
  /** Absent when the App's user tokens do not expire. */
  expiresAt?: Date
  refreshExpiresAt?: Date
}

// Checks whether the App's own OAuth client is configured.
// Without it, repos can't be created in personal accounts.
export function isGithubUserAuthConfigured(): boolean {
  return Boolean(
    ENV_CONFIG.GITHUB_APP_CLIENT_ID && ENV_CONFIG.GITHUB_APP_CLIENT_SECRET,
  )
}

// Builds the URL that asks the user to let the App act as them.
// Needed once per account, only to create repos in personal accounts.
export function getAuthorizeUrl(state: string): string {
  const url = new URL("https://github.com/login/oauth/authorize")
  url.searchParams.set("client_id", ENV_CONFIG.GITHUB_APP_CLIENT_ID)
  url.searchParams.set("state", state)
  return url.toString()
}

// Exchanges a code or refresh token for user tokens with GitHub's OAuth endpoint.
// Shared by exchangeUserCode and refreshUserTokens.
async function requestUserTokens(
  params: Record<string, string>,
): Promise<GithubUserTokens> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: ENV_CONFIG.GITHUB_APP_CLIENT_ID,
      client_secret: ENV_CONFIG.GITHUB_APP_CLIENT_SECRET,
      ...params,
    }),
  })
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    refresh_token_expires_in?: number
    error?: string
    error_description?: string
  }
  if (!response.ok || !data.access_token) {
    throw new Error(
      `GitHub refused the user token request: ${data.error_description ?? data.error ?? response.status}`,
    )
  }
  const now = Date.now()
  return {
    accessToken: data.access_token,
    ...(data.refresh_token && { refreshToken: data.refresh_token }),
    ...(data.expires_in && {
      expiresAt: new Date(now + data.expires_in * 1000),
    }),
    ...(data.refresh_token_expires_in && {
      refreshExpiresAt: new Date(now + data.refresh_token_expires_in * 1000),
    }),
  }
}

// Exchanges the OAuth callback code for user tokens.
// Called from the authorize callback.
export function exchangeUserCode(code: string): Promise<GithubUserTokens> {
  return requestUserTokens({ code })
}

// Refreshes expired user tokens.
// Called before acting as the user when their token has expired.
export function refreshUserTokens(
  refreshToken: string,
): Promise<GithubUserTokens> {
  return requestUserTokens({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })
}

// Returns the GitHub user behind a user token.
// Used to record who commits are authored as.
export async function getTokenUser(
  accessToken: string,
): Promise<{ id: number; login: string }> {
  return githubApi<{ id: number; login: string }>(accessToken, "GET", "/user")
}

// ---------- THE FORGEAI BOT ----------

let bot: Promise<{ name: string; email: string }> | undefined

// Returns the App's bot account as a co-author identity (`<slug>[bot]`), cached per process.
// GitHub shows its avatar beside the owner's on every ForgeAI commit.
export function forgeBotIdentity(): Promise<{ name: string; email: string }> {
  bot ??= (async () => {
    const login = `${ENV_CONFIG.CONNECTION_APP_SLUG}[bot]`
    const response = await fetch(
      `${GITHUB_API}/users/${encodeURIComponent(login)}`,
      {
        signal: AbortSignal.timeout(30_000),
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    )
    if (!response.ok)
      throw new Error(`Couldn't look up ${login}: ${response.status}`)
    const { id } = (await response.json()) as { id: number }
    return { name: "ForgeAI", email: `${id}+${login}@users.noreply.github.com` }
  })().catch((error: unknown) => {
    bot = undefined
    throw error
  })
  return bot
}
