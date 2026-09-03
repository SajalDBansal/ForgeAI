// Reads a required environment variable or throws at startup.
// Used for the database connection string.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const ENV_CONFIG = {
  DATABASE_URL: requireEnv("DATABASE_URL"),
  /** Only used to decide whether to reuse one client across hot reloads. */
  NODE_ENV: process.env.NODE_ENV ?? "development",
}
