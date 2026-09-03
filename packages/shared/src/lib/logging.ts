// What api-server and the orchestrator keep out of their logs. Logs are copied, kept for weeks
// and read by many people, so nothing in them may let someone act as a user.
// Used as Fastify's `logger` option in both services.

const CENSOR = "[redacted]"

/** Field names whose value is always a secret, wherever they appear in a logged object. */
const SECRET_FIELDS = [
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "secret",
  "clientSecret",
  "apiKey",
  "authorization",
  "cookie",
  // A project secret's stored (encrypted) value, and decrypted secrets on their way to a sandbox (I1).
  "valueEnc",
  "secrets",
]

/**
 * pino paths to censor: each secret field at the top level or one level down (`{ body: { token } }`),
 * the GitHub token in git request bodies (`{ body: { remote: { token } } }`), and the auth
 * headers on anything logged with headers (requests, responses, errors).
 */
const REDACT_PATHS = [
  ...SECRET_FIELDS.flatMap((field) => [field, `*.${field}`]),
  "remote.token",
  "*.remote.token",
  "*.headers.authorization",
  "*.headers.cookie",
  '*.headers["set-cookie"]',
]

/** Query parameters that carry a one-time secret: email links, OAuth callbacks, socket tickets. */
const SECRET_QUERY_PARAMS = new Set(["token", "code", "state", "ticket"])

/** Paths with a secret in them: an invite link's token. */
const SECRET_PATH_SEGMENTS = [/^(\/api\/v1\/invite\/)[^/?#]+/]

// Returns the URL with its secrets replaced, for the request log line. The route still gets the
// real URL; only what's written to the log changes.
export function redactUrl(url: string): string {
  let cleaned = url
  for (const pattern of SECRET_PATH_SEGMENTS)
    cleaned = cleaned.replace(pattern, `$1${CENSOR}`)

  const queryStart = cleaned.indexOf("?")
  if (queryStart < 0) return cleaned

  const params = cleaned
    .slice(queryStart + 1)
    .split("&")
    .map((param) => {
      const name = param.split("=")[0] ?? ""
      return SECRET_QUERY_PARAMS.has(name.toLowerCase())
        ? `${name}=${CENSOR}`
        : param
    })
  return `${cleaned.slice(0, queryStart + 1)}${params.join("&")}`
}

/** The parts of a Fastify request the log line needs. */
interface LoggedRequest {
  method: string
  url: string
  host?: string
  ip?: string
  socket?: { remotePort?: number }
}

// Fastify's usual request log fields, with the URL cleaned.
function serializeRequest(request: LoggedRequest) {
  return {
    method: request.method,
    url: redactUrl(request.url),
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket?.remotePort,
  }
}

/** Fastify `logger` option for every HTTP service. */
export const LOGGER_OPTIONS = {
  redact: { paths: REDACT_PATHS, censor: CENSOR },
  serializers: { req: serializeRequest },
}
