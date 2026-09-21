// Reads a required environment variable or throws at startup.
// Used for settings the worker cannot run without.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

// Reads an optional environment variable, falling back when unset or empty.
function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback
}

// Reads a numeric environment variable, falling back when unset or invalid.
function optionalEnvNumber(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const ENV_CONFIG = {
  /** /healthz and /readyz. */
  PORT: optionalEnvNumber("PORT", 3006),
  REDIS_URL: requireEnv("REDIS_URL"),
  // DATABASE_URL is read by @forgeAI/database itself.

  /** Runs worked on at once by this process. Each is a different project (one per project at a time). */
  WORKER_CONCURRENCY: optionalEnvNumber("WORKER_CONCURRENCY", 4),
  /** How long the per-project lock lives without being renewed; renewed every third of this while a run works. */
  RUN_LOCK_TTL_MS: optionalEnvNumber("RUN_LOCK_TTL_MS", 60_000),
  /** How long a run that isn't its project's turn waits before looking again. */
  TURN_WAIT_MS: optionalEnvNumber("TURN_WAIT_MS", 2_000),
  /** How often to repair DB-pending runs whose BullMQ enqueue was missed. */
  RUN_RECONCILE_MS: optionalEnvNumber("RUN_RECONCILE_MS", 10_000),
  /** How often a running worker checks whether the user cancelled the run. */
  RUN_CANCEL_POLL_MS: optionalEnvNumber("RUN_CANCEL_POLL_MS", 1_000),
  /** api-server, for opening a run's sandbox the way a tab does (I5b, option A). */
  INTERNAL_API_URL: requireEnv("INTERNAL_API_URL"),
  INTERNAL_API_TOKEN: requireEnv("INTERNAL_API_TOKEN"),
  /** The orchestrator: every other sandbox call (file tree, NOTES.md, rag-source). */
  ORCHESTRATOR_URL: requireEnv("ORCHESTRATOR_URL"),
  ORCHESTRATOR_TOKEN: requireEnv("ORCHESTRATOR_TOKEN"),
  /** The knowledge graph service (stage Q). Unset: runs go without it. */
  RAG_SERVICE_URL: optionalEnv("RAG_SERVICE_URL", ""),
  RAG_SERVICE_SECRET: optionalEnv("RAG_SERVICE_SECRET", ""),
  /** The longest a run waits for the knowledge graph to update before carrying on without it (Q7). */
  INDEX_TIMEOUT_MS: optionalEnvNumber("INDEX_TIMEOUT_MS", 180_000),
  /** Folder listings walked for the file tree (each covers two levels). */
  MAX_TREE_CALLS: optionalEnvNumber("MAX_TREE_CALLS", 25),
  /** Loop caps for I9: turns are model/tool cycles; tokens are input+output after each model call. */
  AGENT_MAX_TURNS: optionalEnvNumber("AGENT_MAX_TURNS", 40),
  AGENT_MAX_TOKENS: optionalEnvNumber("AGENT_MAX_TOKENS", 90_000),
  /** 0 = off. Millionths of a dollar; checked after each model/tool turn. */
  AGENT_RUN_COST_LIMIT_MICROS: optionalEnvNumber(
    "AGENT_RUN_COST_LIMIT_MICROS",
    0,
  ),
  /** Used only for RAG usage rows when the service reports tokens. */
  RAG_EMBEDDING_MODEL: optionalEnv(
    "RAG_EMBEDDING_MODEL",
    "text-embedding-3-small",
  ),
  RAG_SUMMARY_MODEL: optionalEnv("RAG_SUMMARY_MODEL", "gpt-4.1-nano"),
  /** Wall-clock cap for one model/tool loop attempt. */
  AGENT_RUN_TIMEOUT_MS: optionalEnvNumber("AGENT_RUN_TIMEOUT_MS", 10 * 60_000),
  /** On SIGTERM, how long to wait for runs in progress before exiting anyway. */
  SHUTDOWN_GRACE_SECONDS: optionalEnvNumber("SHUTDOWN_GRACE_SECONDS", 30),
}
