import { hostname } from "node:os"

import {
  SANDBOX_PROVIDERS,
  type SandboxProviderName,
} from "@forgeAI/sandbox-provider"
import { resolveSandboxPlan } from "@forgeAI/shared"

// Reads a required environment variable or throws at startup.
// Used for settings the orchestrator cannot run without.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

// Reads a required secret and rejects values too short to be safe.
// Catches weak tokens at startup instead of in production.
function requireSecret(name: string, minLength = 32): string {
  const value = requireEnv(name)
  if (value.length < minLength) {
    throw new Error(
      `${name} must be at least ${minLength} characters — generate one with: openssl rand -hex 32`,
    )
  }
  return value
}

// Reads a numeric environment variable, falling back when unset or invalid.
// Used for tunable timeouts and limits.
function optionalEnvNumber(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

// Reads a string environment variable, falling back when unset or empty.
// Used for optional R2 folder names.
function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name]
  return value && value.length > 0 ? value : fallback
}

// Names the environment this orchestrator's sandboxes belong to, so it only ever sees its own on
// a shared E2B account. Required in production; locally each computer gets its own by default.
function sandboxEnvironment(): string {
  const value = optionalEnv("SANDBOX_ENVIRONMENT", "")
  if (value) return value
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Missing required environment variable: SANDBOX_ENVIRONMENT (for example staging or production)",
    )
  }
  return `local-${hostname().toLowerCase()}`
}

// The lifetime now comes from the plan; say so if the old setting is still around.
if (optionalEnv("SANDBOX_MAX_LIFETIME_MINUTES", "")) {
  console.warn(
    "[config] SANDBOX_MAX_LIFETIME_MINUTES is no longer read: the lifetime comes from SANDBOX_PLAN (override with SANDBOX_PLAN_LIFETIME_MINUTES)",
  )
}

// Which sandbox provider to use (F4). Only "e2b" exists today; a typo stops start-up.
function sandboxProvider(): SandboxProviderName {
  const name = optionalEnv("SANDBOX_PROVIDER", "e2b")
  if (!(SANDBOX_PROVIDERS as readonly string[]).includes(name)) {
    throw new Error(
      `SANDBOX_PROVIDER "${name}" is unknown; use one of: ${SANDBOX_PROVIDERS.join(", ")}`,
    )
  }
  return name as SandboxProviderName
}

/** This orchestrator's own limits (capacity §4.1). */
const TARGET_SANDBOXES = optionalEnvNumber("ORCHESTRATOR_TARGET_SANDBOXES", 80)
const MAX_SANDBOXES = optionalEnvNumber("ORCHESTRATOR_MAX_SANDBOXES", 100)
if (TARGET_SANDBOXES > MAX_SANDBOXES) {
  throw new Error(
    `ORCHESTRATOR_TARGET_SANDBOXES (${TARGET_SANDBOXES}) must not be above ORCHESTRATOR_MAX_SANDBOXES (${MAX_SANDBOXES})`,
  )
}

export const ENV_CONFIG = {
  PORT: requireEnv("PORT"),
  /** Shared secret api-server sends on every request; it is the only allowed caller. */
  ORCHESTRATOR_TOKEN: requireSecret("ORCHESTRATOR_TOKEN"),
  REDIS_URL: requireEnv("REDIS_URL"),

  /** Stable name; in Kubernetes the StatefulSet pod name, so a restart keeps it (capacity §4.1). */
  ORCHESTRATOR_ID: optionalEnv("ORCHESTRATOR_ID", "orchestrator-0"),
  /** Comfortable load: with several orchestrators, new projects prefer ones under it (stage N). */
  ORCHESTRATOR_TARGET_SANDBOXES: TARGET_SANDBOXES,
  /** Hard limit for this process's memory, never exceeded even if the plan has room (used from E7). */
  ORCHESTRATOR_MAX_SANDBOXES: MAX_SANDBOXES,
  /** Event-loop lag (p99, ms) above which, for 30 s, the orchestrator takes no new projects (E17). */
  ORCHESTRATOR_MAX_EVENT_LOOP_LAG_MS: optionalEnvNumber(
    "ORCHESTRATOR_MAX_EVENT_LOOP_LAG_MS",
    200,
  ),
  /** The same for heap use, as a % of the heap's limit. */
  ORCHESTRATOR_MAX_HEAP_PERCENT: optionalEnvNumber(
    "ORCHESTRATOR_MAX_HEAP_PERCENT",
    80,
  ),

  /** Which sandbox provider runs the sandboxes (lib/provider.ts). */
  SANDBOX_PROVIDER: sandboxProvider(),
  E2B_API_KEY: requireEnv("E2B_API_KEY"),
  /** What the E2B plan allows (concurrency, creation rate, lifetime). Refuses to start on a bad setting. */
  SANDBOX_PLAN: resolveSandboxPlan(),
  /** Tagged on every sandbox this orchestrator creates; it ignores sandboxes with any other tag. */
  SANDBOX_ENVIRONMENT: sandboxEnvironment(),
  SANDBOX_IDLE_TIMEOUT_MINUTES: optionalEnvNumber(
    "SANDBOX_IDLE_TIMEOUT_MINUTES",
    30,
  ),
  /** How long a dev server survives after the last viewer leaves (long enough to ride out a refresh). */
  DEV_SERVER_UNWATCHED_GRACE_SECONDS: optionalEnvNumber(
    "DEV_SERVER_UNWATCHED_GRACE_SECONDS",
    90,
  ),
  /** How long a sandbox survives with nobody connected (work is snapshotted first). */
  SANDBOX_UNWATCHED_REAP_MINUTES: optionalEnvNumber(
    "SANDBOX_UNWATCHED_REAP_MINUTES",
    10,
  ),
  /** How long a sandbox survives while open but idle; a running dev server doesn't count as idle. */
  SANDBOX_IDLE_REAP_MINUTES: optionalEnvNumber("SANDBOX_IDLE_REAP_MINUTES", 45),
  /** How long before that deadline the open tab is warned. */
  SANDBOX_IDLE_WARNING_MINUTES: optionalEnvNumber(
    "SANDBOX_IDLE_WARNING_MINUTES",
    5,
  ),
  /** Plan usage (% of usable slots) above which idle sandboxes are reaped sooner (capacity §7.5). */
  SANDBOX_PRESSURE_HIGH_PERCENT: optionalEnvNumber(
    "SANDBOX_PRESSURE_HIGH_PERCENT",
    70,
  ),
  SANDBOX_PRESSURE_HIGH_UNWATCHED_MINUTES: optionalEnvNumber(
    "SANDBOX_PRESSURE_HIGH_UNWATCHED_MINUTES",
    5,
  ),
  SANDBOX_PRESSURE_HIGH_IDLE_MINUTES: optionalEnvNumber(
    "SANDBOX_PRESSURE_HIGH_IDLE_MINUTES",
    20,
  ),
  /** Sandbox-hours per UTC day for the whole account; once used, new sandboxes wait until tomorrow. 0 = off. */
  SANDBOX_DAILY_BUDGET_HOURS: optionalEnvNumber(
    "SANDBOX_DAILY_BUDGET_HOURS",
    0,
  ),
  /** Logged once a day when usage passes this share of the budget. */
  SANDBOX_BUDGET_WARN_PERCENT: optionalEnvNumber(
    "SANDBOX_BUDGET_WARN_PERCENT",
    80,
  ),
  /** Above this, sooner still. */
  SANDBOX_PRESSURE_CRITICAL_PERCENT: optionalEnvNumber(
    "SANDBOX_PRESSURE_CRITICAL_PERCENT",
    90,
  ),
  SANDBOX_PRESSURE_CRITICAL_UNWATCHED_MINUTES: optionalEnvNumber(
    "SANDBOX_PRESSURE_CRITICAL_UNWATCHED_MINUTES",
    2,
  ),
  SANDBOX_PRESSURE_CRITICAL_IDLE_MINUTES: optionalEnvNumber(
    "SANDBOX_PRESSURE_CRITICAL_IDLE_MINUTES",
    10,
  ),
  /** How long a shared document nobody has open stays in memory before it is saved and freed. */
  DOC_IDLE_CLOSE_MINUTES: optionalEnvNumber("DOC_IDLE_CLOSE_MINUTES", 5),
  /** Most entries the file tree is sent per folder; the rest are counted, not listed. */
  FILE_TREE_MAX_ENTRIES: optionalEnvNumber("FILE_TREE_MAX_ENTRIES", 100),
  /** Largest file the editor will open; bigger ones are refused instead of loaded into memory. */
  EDITOR_MAX_FILE_BYTES: optionalEnvNumber(
    "EDITOR_MAX_FILE_BYTES",
    2 * 1024 * 1024,
  ),
  /** Most autosaves the 30-second sweep runs at once; the rest queue and start as others finish. */
  SNAPSHOT_CONCURRENCY: optionalEnvNumber("SNAPSHOT_CONCURRENCY", 10),
  /** Time spent saving on shutdown; must be shorter than the platform's SIGTERM→SIGKILL grace. */
  SHUTDOWN_SAVE_SECONDS: optionalEnvNumber("SHUTDOWN_SAVE_SECONDS", 20),
  /** How long before the plan's lifetime cap a sandbox is saved and replaced with a fresh one. */
  SANDBOX_RECYCLE_MARGIN_MINUTES: optionalEnvNumber(
    "SANDBOX_RECYCLE_MARGIN_MINUTES",
    10,
  ),

  R2_BUCKET_NAME: requireEnv("R2_BUCKET_NAME"),
  R2_BUCKET_ENDPOINT: requireEnv("R2_BUCKET_ENDPOINT"),
  R2_TEMPLATE_FOLDER_NAME: optionalEnv("R2_TEMPLATE_FOLDER_NAME", "templates"),
  R2_SNAPSHOT_FOLDER_NAME: optionalEnv("R2_SNAPSHOT_FOLDER_NAME", "snapshots"),
  R2_ACCOUNT_ID: requireEnv("R2_ACCOUNT_ID"),
  R2_ACCESS_KEY_ID: requireEnv("R2_ACCESS_KEY_ID"),
  R2_SECRET_ACCESS_KEY: requireEnv("R2_SECRET_ACCESS_KEY"),
}
