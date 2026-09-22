import type { FastifyRequest } from "fastify"

/** At most `max` requests per `windowSeconds` for one subject (a user, or a user on one project). */
export interface RateLimit {
  name: string
  max: number
  windowSeconds: number
}

// Limits on the routes that cost money, use shared provider quota or are easy public abuse targets.
// User-scoped limits are checked in controllers right after requireSession. Public browser-facing
// limits are checked before route handlers and keyed by the request IP after Fastify's trustProxy
// handling.
export const RATE_LIMITS = {
  /** Open or restart a sandbox: E2B costs money and limits creates per account. Per user and project. */
  sandbox: { name: "sandbox", max: 10, windowSeconds: 60 },
  /** Commit, roll back, put on GitHub, resolve: each uses the GitHub installation's hourly quota. Per user. */
  git: { name: "git", max: 6, windowSeconds: 60 },
  /** Build chat messages (the agent's, later, cost LLM money). Per user. */
  chatMessage: { name: "chat-message", max: 30, windowSeconds: 60 },
  /** Team chat messages. Per user. */
  teamMessage: { name: "team-message", max: 30, windowSeconds: 60 },
  /** WebSocket tickets, one per (re)connect of each tab. Per user. */
  wsTicket: { name: "ws-ticket", max: 30, windowSeconds: 60 },
  /** Browser auth mutations such as sign-in, sign-up, password reset and email verification. Per IP. */
  authAttempt: { name: "auth-attempt", max: 30, windowSeconds: 60 },
  /** Browser auth callback/link endpoints. Per IP. */
  authCallback: { name: "auth-callback", max: 60, windowSeconds: 60 },
  /** OAuth/App install redirects started by a signed-in user. Per user and provider. */
  connectionStart: { name: "connection-start", max: 12, windowSeconds: 60 },
  /** OAuth/App callback requests from external providers. Per IP. */
  connectionCallback: {
    name: "connection-callback",
    max: 60,
    windowSeconds: 60,
  },
  /** Pasted provider credentials that cause an external validation call. Per user. */
  connectionCredential: {
    name: "connection-credential",
    max: 6,
    windowSeconds: 60,
  },
  /** Public invitation token lookups. Per IP. */
  invitePreview: { name: "invite-preview", max: 60, windowSeconds: 60 },
  /** Invitation acceptance attempts. Per IP before the session/user checks. */
  inviteAccept: { name: "invite-accept", max: 20, windowSeconds: 60 },
  /** Public preview proxy traffic. Per IP, high enough for asset-heavy dev pages. */
  publicPreview: { name: "public-preview", max: 1200, windowSeconds: 60 },
} satisfies Record<string, RateLimit>

export interface PublicAbuseLimitMatch {
  limit: RateLimit
  scope: string
}

const AUTH_CALLBACK_PREFIXES = ["callback", "verify-email"]
const CONNECTION_PROVIDERS = new Set(["github", "supabase", "vercel"])

function normalizedPath(pathname: string): string {
  const lower = pathname.toLowerCase()
  return lower.length > 1 ? lower.replace(/\/+$/, "") : lower
}

function authSubpath(pathname: string): string | null {
  const prefix = "/api/v1/auth/"
  if (!pathname.startsWith(prefix)) return null
  return pathname.slice(prefix.length)
}

function pathSegment(value: string, index: number): string {
  return value.split("/").filter(Boolean)[index] ?? ""
}

export function publicAbuseLimitForRequest(
  method: string,
  pathname: string,
): PublicAbuseLimitMatch | null {
  const methodUpper = method.toUpperCase()
  const path = normalizedPath(pathname)
  const authPath = authSubpath(path)

  if (authPath !== null) {
    const first = pathSegment(authPath, 0)
    if (
      methodUpper === "GET" &&
      AUTH_CALLBACK_PREFIXES.some((prefix) => authPath.startsWith(prefix))
    ) {
      return { limit: RATE_LIMITS.authCallback, scope: `auth:${first}` }
    }
    if (methodUpper === "POST") {
      return { limit: RATE_LIMITS.authAttempt, scope: `auth:${first}` }
    }
  }

  const connectionMatch = path.match(
    /^\/api\/v1\/connections\/([^/]+)\/(start|authorize|callback)$/,
  )
  if (connectionMatch) {
    const [, provider, action] = connectionMatch
    if (provider && action && CONNECTION_PROVIDERS.has(provider)) {
      return {
        limit:
          action === "callback"
            ? RATE_LIMITS.connectionCallback
            : RATE_LIMITS.connectionStart,
        scope: `connection:${provider}:${action}`,
      }
    }
  }

  const inviteMatch = path.match(/^\/api\/v1\/invite\/[^/]+(\/accept)?$/)
  if (inviteMatch) {
    if (methodUpper === "GET" && !inviteMatch[1]) {
      return { limit: RATE_LIMITS.invitePreview, scope: "invite:preview" }
    }
    if (methodUpper === "POST" && inviteMatch[1]) {
      return { limit: RATE_LIMITS.inviteAccept, scope: "invite:accept" }
    }
  }

  if (path.startsWith("/api/v1/preview/public/")) {
    return { limit: RATE_LIMITS.publicPreview, scope: "preview:public" }
  }

  return null
}

export function requestRateLimitSubject(request: FastifyRequest): string {
  const ip = request.ip || request.socket.remoteAddress || "unknown"
  return String(ip).trim() || "unknown"
}
