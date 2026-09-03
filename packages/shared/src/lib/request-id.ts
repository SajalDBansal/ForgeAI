import { randomUUID } from "node:crypto"

// Node-only (node:crypto): used by api-server and the orchestrator, never by apps/web.

/** The header a request id travels in: browser → api-server → orchestrator, and back to the browser. */
export const REQUEST_ID_HEADER = "x-request-id"

/** What an incoming id may look like; anything else is replaced, so nobody can write odd text into our logs. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/

// Reuses an incoming request id when it looks safe, otherwise makes a fresh one.
// Used as Fastify's `genReqId`, so every log line of a request carries the same id.
export function requestIdFrom(incoming: string | string[] | undefined): string {
  return typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming)
    ? incoming
    : randomUUID()
}
