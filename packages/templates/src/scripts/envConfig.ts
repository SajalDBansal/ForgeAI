import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { config } from "dotenv"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..")

// DATABASE_URL lives in packages/database/.env; E2B and R2 credentials in apps/orchestrator/.env.
config({ path: resolve(repoRoot, "packages/database/.env") })
config({ path: resolve(repoRoot, "apps/orchestrator/.env") })

// Reads a required environment variable or throws.
// Fails the sync early when credentials are missing.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

// Reads a string environment variable, falling back when unset or empty.
// Used for the optional R2 folder name.
function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name]
  return value && value.length > 0 ? value : fallback
}

export const ENV_CONFIG = {
  /** The provider images are built on (the orchestrator's setting; "e2b" by default). */
  SANDBOX_PROVIDER: optionalEnv("SANDBOX_PROVIDER", "e2b"),
  E2B_API_KEY: requireEnv("E2B_API_KEY"),
  R2_BUCKET_NAME: requireEnv("R2_BUCKET_NAME"),
  R2_BUCKET_ENDPOINT: requireEnv("R2_BUCKET_ENDPOINT"),
  R2_TEMPLATE_FOLDER_NAME: optionalEnv("R2_TEMPLATE_FOLDER_NAME", "templates"),
  R2_ACCESS_KEY_ID: requireEnv("R2_ACCESS_KEY_ID"),
  R2_SECRET_ACCESS_KEY: requireEnv("R2_SECRET_ACCESS_KEY"),
}
