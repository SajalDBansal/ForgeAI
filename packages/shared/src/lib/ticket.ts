import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

// Node-only: never import from apps/web. api-server mints tickets, ws-server verifies them.

export interface VerifiedTicket {
  subject: string
  extra: string
  expiresAt: number
}

// Long enough for the browser to fetch a ticket and open the WebSocket with it.
const DEFAULT_TTL_MS = 60_000

// Builds the HMAC signature for a ticket payload.
// Shared by signTicket and verifyTicket so both hash the exact same string.
function signPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex")
}

// Signs a short-lived, tamper-proof ticket granting `subject` the given `scope`.
// Used for WebSocket auth, where there is no cookie or database lookup available.
export function signTicket(
  secret: string,
  subject: string,
  scope: string,
  extra = "",
  ttlMs = DEFAULT_TTL_MS,
): string {
  const nonce = randomBytes(9).toString("hex")
  const expiresAt = Date.now() + ttlMs
  const payload = `${subject}.${scope}.${expiresAt}.${nonce}.${extra}`
  return Buffer.from(`${payload}.${signPayload(secret, payload)}`).toString(
    "base64url",
  )
}

// Compares two hex signatures in constant time.
// Keeps ticket verification safe against timing attacks.
function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "hex")
  const expectedBuffer = Buffer.from(expected, "hex")
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

// Verifies a ticket from signTicket and returns its claims.
// Returns null when the ticket is malformed, for another scope, tampered with or expired.
export function verifyTicket(
  secret: string,
  ticket: string,
  scope: string,
): VerifiedTicket | null {
  try {
    const [subject, ticketScope, expiresAtRaw, nonce, extra, signature] =
      Buffer.from(ticket, "base64url").toString("utf8").split(".")
    if (
      !subject ||
      ticketScope !== scope ||
      !expiresAtRaw ||
      !nonce ||
      extra === undefined ||
      !signature
    ) {
      return null
    }

    const expected = signPayload(
      secret,
      `${subject}.${ticketScope}.${expiresAtRaw}.${nonce}.${extra}`,
    )
    if (!signaturesMatch(signature, expected)) return null

    const expiresAt = Number(expiresAtRaw)
    if (Date.now() > expiresAt) return null

    return { subject, extra, expiresAt }
  } catch {
    return null
  }
}
