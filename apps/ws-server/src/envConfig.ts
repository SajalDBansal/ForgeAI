// Reads a required environment variable or throws at startup.
// Used for settings the server cannot run without.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

// Reads a numeric environment variable, falling back when unset or invalid.
// Used for tunable timeouts.
function optionalEnvNumber(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const ENV_CONFIG = {
  PORT: requireEnv("PORT"),
  CLIENT_ORIGIN: requireEnv("CLIENT_ORIGIN"),
  REDIS_URL: requireEnv("REDIS_URL"),
  WS_TICKET_SECRET: requireEnv("WS_TICKET_SECRET"),
  WS_PING_INTERVAL_MS: optionalEnvNumber("WS_PING_INTERVAL_MS", 25_000),
  WS_PING_TIMEOUT_MS: optionalEnvNumber("WS_PING_TIMEOUT_MS", 20_000),
  /** Max socket lifetime before a forced reconnect; bounds how long stale access can last. */
  WS_MAX_CONNECTION_MINUTES: optionalEnvNumber("WS_MAX_CONNECTION_MINUTES", 15),
  /** On SIGTERM, how long disconnecting all sockets is spread over, so tabs don't all reconnect at once. 0 locally. */
  SHUTDOWN_DRAIN_SECONDS: optionalEnvNumber(
    "SHUTDOWN_DRAIN_SECONDS",
    process.env.NODE_ENV === "production" ? 10 : 0,
  ),
}
