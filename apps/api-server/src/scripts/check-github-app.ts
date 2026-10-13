import "dotenv/config"

import {
  forgeBotIdentity,
  getAppInfo,
  isGithubUserAuthConfigured,
  listAppInstallations,
} from "../lib/connections/github.js"
import { ENV_CONFIG } from "../lib/envConfig.js"

// `bun run github:check`: reports what the GitHub App and its installations still need
// for ForgeAI to create repos and push. Read-only; changes nothing on GitHub.

/** What the App must be allowed, and why. */
const REQUIRED: Record<string, { level: "read" | "write"; why: string }> = {
  contents: { level: "write", why: "push commits" },
  workflows: {
    level: "write",
    why: "push commits that touch .github/workflows",
  },
  administration: { level: "write", why: "create each project's repository" },
  metadata: { level: "read", why: "read repositories at all" },
}

/** Only needed for Phase 4 (live updates); reported, not required. */
const WEBHOOK_EVENTS = ["push", "repository", "installation_repositories"]

// Checks whether a granted permission level meets the required one.
// "write" and "admin" satisfy everything; "read" only satisfies read.
const enough = (granted: string | undefined, needed: "read" | "write") =>
  granted === "write" ||
  granted === "admin" ||
  (needed === "read" && granted === "read")

let problems = 0
// Prints a passing check.
const ok = (line: string) => console.log(`  ✓ ${line}`)
// Prints a failing check and counts it.
const bad = (line: string) => {
  problems++
  console.log(`  ✗ ${line}`)
}
// Prints an informational note.
const info = (line: string) => console.log(`  · ${line}`)

console.log("\nGitHub App")
const app = await getAppInfo()
ok(`found "${app.name}" (${app.slug})`)
if (app.slug === ENV_CONFIG.CONNECTION_APP_SLUG)
  ok("CONNECTION_APP_SLUG matches")
else
  bad(
    `CONNECTION_APP_SLUG is "${ENV_CONFIG.CONNECTION_APP_SLUG}" but the App's slug is "${app.slug}"`,
  )

console.log(
  "\nPermissions the App asks for (App settings → Permissions & events)",
)
for (const [name, { level, why }] of Object.entries(REQUIRED)) {
  const granted = app.permissions[name]
  if (enough(granted, level)) ok(`${name}: ${granted}`)
  else
    bad(
      `${name}: ${granted ?? "none"} — set to "${level === "write" ? "Read and write" : "Read-only"}" (to ${why})`,
    )
}

console.log("\nActing as the owner (App settings → General)")
if (isGithubUserAuthConfigured()) {
  if (ENV_CONFIG.GITHUB_APP_CLIENT_ID === app.clientId)
    ok("GITHUB_APP_CLIENT_ID matches the App")
  else
    bad(
      `GITHUB_APP_CLIENT_ID doesn't match the App's Client ID (${app.clientId})`,
    )
  ok(
    "GITHUB_APP_CLIENT_SECRET is set (GitHub can't confirm it until someone authorizes)",
  )
} else {
  bad(
    `GITHUB_APP_CLIENT_ID / GITHUB_APP_CLIENT_SECRET not set — use the App's Client ID (${app.clientId}) and a generated client secret`,
  )
}
info(
  `Callback URL must be: ${ENV_CONFIG.BETTER_AUTH_URL}/api/v1/connections/github/callback (GitHub doesn't expose it, so check by eye)`,
)

console.log("\nThe ForgeAI bot (co-author on every commit)")
try {
  const bot = await forgeBotIdentity()
  ok(`${bot.name} <${bot.email}>`)
} catch (error) {
  bad(
    `couldn't look up ${app.slug}[bot]: ${error instanceof Error ? error.message : String(error)}`,
  )
}

console.log("\nInstallations (each account must accept new permissions itself)")
const installations = await listAppInstallations()
if (installations.length === 0) info("none yet — nobody has connected GitHub")
for (const installation of installations) {
  const missing = Object.entries(REQUIRED)
    .filter(
      ([name, { level }]) => !enough(installation.permissions[name], level),
    )
    .map(([name]) => name)
  if (missing.length === 0)
    ok(`${installation.account} (${installation.accountType}): all granted`)
  else
    bad(
      `${installation.account} (${installation.accountType}): not yet accepted — ${missing.join(", ")}. Accept at ${installation.htmlUrl}`,
    )
}

console.log("\nWebhook events (Phase 4 only — optional for now)")
for (const event of WEBHOOK_EVENTS) {
  if (app.events.includes(event)) ok(event)
  else info(`${event}: not subscribed`)
}

console.log(
  problems === 0
    ? "\nReady for Phase 1.\n"
    : `\n${problems} thing(s) to fix before Phase 1.\n`,
)
process.exit(problems === 0 ? 0 : 1)
