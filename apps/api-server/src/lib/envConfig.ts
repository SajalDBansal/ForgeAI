import { resolveSandboxPlan } from "@forgeAI/shared"

// Reads a required environment variable or throws at startup.
// Used for settings the API cannot run without.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

// Reads an optional environment variable, falling back when unset or empty.
// Used for features that can be turned off.
function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name]
  return value && value.length > 0 ? value : fallback
}

// Reads a numeric environment variable, falling back when unset or invalid.
// Used for tunable lifetimes and timeouts.
function optionalEnvNumber(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

// Reads a boolean environment variable. Only explicit true-ish values enable it.
function optionalEnvBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]
  if (!value) return fallback
  return ["1", "true", "yes", "on"].includes(value.toLowerCase())
}

export const ENV_CONFIG = {
  PORT: requireEnv("PORT"),
  DATABASE_URL: requireEnv("DATABASE_URL"),
  BETTER_AUTH_SECRET: requireEnv("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: requireEnv("BETTER_AUTH_URL"),
  CLIENT_ORIGIN: requireEnv("CLIENT_ORIGIN"),
  /** Public base URL for preview proxy links. Use a cookieless origin in production. */
  PREVIEW_PUBLIC_ORIGIN: optionalEnv(
    "PREVIEW_PUBLIC_ORIGIN",
    requireEnv("BETTER_AUTH_URL"),
  ),
  TRUST_PROXY: optionalEnvBoolean("TRUST_PROXY", false),
  GITHUB_CLIENT_ID: requireEnv("GITHUB_CLIENT_ID"),
  GITHUB_CLIENT_SECRET: requireEnv("GITHUB_CLIENT_SECRET"),
  GOOGLE_CLIENT_ID: requireEnv("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: requireEnv("GOOGLE_CLIENT_SECRET"),
  RESEND_API_KEY: requireEnv("RESEND_API_KEY"),
  EMAIL_FROM: requireEnv("EMAIL_FROM"),
  CONNECTION_APP_SLUG: requireEnv("CONNECTION_APP_SLUG"),
  CONNECTION_ENCRYPTION_KEY: requireEnv("CONNECTION_ENCRYPTION_KEY"),
  /** Identifier for newly encrypted connection tokens. Keep old IDs in CONNECTION_PREVIOUS_ENCRYPTION_KEYS during rotation. */
  CONNECTION_ENCRYPTION_KEY_ID: optionalEnv(
    "CONNECTION_ENCRYPTION_KEY_ID",
    "current",
  ),
  /** Comma-separated old connection token keys, as keyId=secret. Used only to read and rotate old rows. */
  CONNECTION_PREVIOUS_ENCRYPTION_KEYS: optionalEnv(
    "CONNECTION_PREVIOUS_ENCRYPTION_KEYS",
    "",
  ),
  GITHUB_APP_ID: requireEnv("GITHUB_APP_ID"),
  GITHUB_APP_PRIVATE_KEY: requireEnv("GITHUB_APP_PRIVATE_KEY"),
  /** The GitHub App's OAuth client (not the sign-in one); needed to create repos in personal accounts. Empty disables that. */
  GITHUB_APP_CLIENT_ID: optionalEnv("GITHUB_APP_CLIENT_ID", ""),
  GITHUB_APP_CLIENT_SECRET: optionalEnv("GITHUB_APP_CLIENT_SECRET", ""),
  VERCEL_CLIENT_ID: requireEnv("VERCEL_CLIENT_ID"),
  VERCEL_CLIENT_SECRET: requireEnv("VERCEL_CLIENT_SECRET"),
  SUPABASE_CLIENT_ID: requireEnv("SUPABASE_CLIENT_ID"),
  SUPABASE_CLIENT_SECRET: requireEnv("SUPABASE_CLIENT_SECRET"),
  REDIS_URL: requireEnv("REDIS_URL"),
  WS_TICKET_SECRET: requireEnv("WS_TICKET_SECRET"),
  ORCHESTRATOR_URL: requireEnv("ORCHESTRATOR_URL"),
  /** Sent to the orchestrator on every call; it refuses anything without it. */
  ORCHESTRATOR_TOKEN: requireEnv("ORCHESTRATOR_TOKEN"),
  /** Guards /api/v1/internal (the agent worker, I5b). Unset: every internal request is refused. */
  INTERNAL_API_TOKEN: optionalEnv("INTERNAL_API_TOKEN", ""),
  /** The knowledge graph service (apps/rag-service, work plan Q5). Optional: unset, deleting a project skips it. */
  RAG_SERVICE_URL: optionalEnv("RAG_SERVICE_URL", ""),
  /** Sent as `x-rag-secret`; the same value as apps/rag-service/.env. */
  RAG_SERVICE_SECRET: optionalEnv("RAG_SERVICE_SECRET", ""),
  /** Model spend budgets for agent/RAG usage. 0 = off. Values are millionths of a US dollar. */
  AGENT_DAILY_BUDGET_MICROS: optionalEnvNumber("AGENT_DAILY_BUDGET_MICROS", 0),
  AGENT_OWNER_MONTHLY_BUDGET_MICROS: optionalEnvNumber(
    "AGENT_OWNER_MONTHLY_BUDGET_MICROS",
    0,
  ),
  /** Encrypts Team chat messages at rest. Rotate by keeping old keys in TEAM_CHAT_PREVIOUS_ENCRYPTION_KEYS. */
  TEAM_CHAT_ENCRYPTION_KEY: requireEnv("TEAM_CHAT_ENCRYPTION_KEY"),
  /** Identifier for newly encrypted Team chat rows. */
  TEAM_CHAT_ENCRYPTION_KEY_ID: optionalEnv(
    "TEAM_CHAT_ENCRYPTION_KEY_ID",
    "current",
  ),
  /** Comma-separated old Team chat keys, as keyId=secret. */
  TEAM_CHAT_PREVIOUS_ENCRYPTION_KEYS: optionalEnv(
    "TEAM_CHAT_PREVIOUS_ENCRYPTION_KEYS",
    "",
  ),
  /** Encrypts project secrets (users' app env vars) at rest. Rotate by keeping old keys in PROJECT_SECRETS_PREVIOUS_ENCRYPTION_KEYS. */
  PROJECT_SECRETS_ENCRYPTION_KEY: requireEnv("PROJECT_SECRETS_ENCRYPTION_KEY"),
  /** Identifier for newly encrypted project secret rows. */
  PROJECT_SECRETS_ENCRYPTION_KEY_ID: optionalEnv(
    "PROJECT_SECRETS_ENCRYPTION_KEY_ID",
    "current",
  ),
  /** Comma-separated old project secret keys, as keyId=secret. */
  PROJECT_SECRETS_PREVIOUS_ENCRYPTION_KEYS: optionalEnv(
    "PROJECT_SECRETS_PREVIOUS_ENCRYPTION_KEYS",
    "",
  ),
  R2_BUCKET_NAME: requireEnv("R2_BUCKET_NAME"),
  R2_BUCKET_ENDPOINT: requireEnv("R2_BUCKET_ENDPOINT"),
  R2_ACCESS_KEY_ID: requireEnv("R2_ACCESS_KEY_ID"),
  R2_SECRET_ACCESS_KEY: requireEnv("R2_SECRET_ACCESS_KEY"),
  // Must match the orchestrator's snapshot folder.
  R2_SNAPSHOT_FOLDER_NAME: optionalEnv("R2_SNAPSHOT_FOLDER_NAME", "snapshots"),

  /** How long a connection card's third-party data (repos, projects, services) stays cached. */
  CONNECTION_CACHE_TTL_SECONDS: optionalEnvNumber(
    "CONNECTION_CACHE_TTL_SECONDS",
    45,
  ),
  /** How long the app-shell metadata (workspaces, projects, collaborators) stays cached. */
  METADATA_CACHE_TTL_SECONDS: optionalEnvNumber(
    "METADATA_CACHE_TTL_SECONDS",
    20,
  ),
  /** Templates change through a separate publish pipeline, so they can sit longer. */
  TEMPLATE_CACHE_TTL_SECONDS: optionalEnvNumber(
    "TEMPLATE_CACHE_TTL_SECONDS",
    300,
  ),
  /** How long a finished request is remembered for an Idempotency-Key replay. */
  IDEMPOTENCY_RESULT_TTL_SECONDS: optionalEnvNumber(
    "IDEMPOTENCY_RESULT_TTL_SECONDS",
    60 * 60,
  ),
  /** How long a running request holds its Idempotency-Key; outlasts the slowest wrapped call. */
  IDEMPOTENCY_RUNNING_TTL_MS: optionalEnvNumber(
    "IDEMPOTENCY_RUNNING_TTL_MS",
    30_000,
  ),
  /** Long enough to finish an OAuth-style redirect round trip. */
  CONNECT_STATE_TTL_MS: optionalEnvNumber(
    "CONNECT_STATE_TTL_MS",
    10 * 60 * 1000,
  ),
  /** How long a look at GitHub's branch head is trusted before asking again. */
  GITHUB_HEAD_CHECK_TTL_MS: optionalEnvNumber(
    "GITHUB_HEAD_CHECK_TTL_MS",
    60_000,
  ),
  /** Template download link lifetime: long enough to finish, short enough that a leaked link is useless. */
  TEMPLATE_DOWNLOAD_URL_TTL_SECONDS: optionalEnvNumber(
    "TEMPLATE_DOWNLOAD_URL_TTL_SECONDS",
    300,
  ),
  /** Connections to the orchestrator per api-server copy. Opening a sandbox holds one for up to a minute,
   *  so a small pool makes every file read wait behind a few slow opens. */
  ORCHESTRATOR_POOL_CONNECTIONS: optionalEnvNumber(
    "ORCHESTRATOR_POOL_CONNECTIONS",
    64,
  ),
  /** On SIGTERM, how long to keep serving while failing /readyz, so the load balancer moves away first. 0 locally. */
  SHUTDOWN_DRAIN_SECONDS: optionalEnvNumber(
    "SHUTDOWN_DRAIN_SECONDS",
    process.env.NODE_ENV === "production" ? 5 : 0,
  ),
  /**
   * Sandboxes a workspace owner may have at once (capacity §5). Every owner is "free" until billing
   * exists; then this comes from their plan. Set it higher in a local .env while developing.
   */
  OWNER_MAX_SANDBOXES: optionalEnvNumber("OWNER_MAX_SANDBOXES", 2),
  /** What the E2B plan allows; must match the orchestrator's. Refuses to start on a bad setting. */
  SANDBOX_PLAN: resolveSandboxPlan(),
}
