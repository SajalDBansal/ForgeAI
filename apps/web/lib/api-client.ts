import { PUBLIC_ENV } from "@/lib/env"
const AUTH_URL = PUBLIC_ENV.AUTH_URL

/** Sent by the API when a request with the same Idempotency-Key is still running. */
const REQUEST_IN_PROGRESS = "REQUEST_IN_PROGRESS"

/** How much of the request id a user sees: short enough to read out, enough to find it in the logs. */
const REFERENCE_LENGTH = 8

/**
 * `status` is set when the server answered with an error; absent when it couldn't be reached.
 * `requestId` is the API's id for the request, which finds it in the server logs.
 * `body` is the error's whole JSON, for the few callers that need more than the message.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false
      message: string
      status?: number
      code?: string
      requestId?: string
      body?: unknown
    }

// Checks whether a failure just means "the first copy of this request is still running".
// Callers skip the error message then, since that first request will report the real outcome.
export function isInProgress(result: ApiResult<unknown>): boolean {
  return !result.ok && result.code === REQUEST_IN_PROGRESS
}

// Adds "(Ref: 1a2b3c4d)" to a server error, so the user can quote it and support can find the
// request in the logs. Only for unexpected 5xx: a 4xx tells the user what to fix, and a 503 is a
// deliberate "try later" (all environments busy, today's limit reached) that already says why.
function withReference(
  message: string,
  status: number,
  requestId: string | undefined,
): string {
  return status >= 500 && status !== 503 && requestId
    ? `${message} (Ref: ${requestId.slice(0, REFERENCE_LENGTH)})`
    : message
}

// Reads the API's `{ error, code }` from a failed response, using the fallback message if there is none.
// Keeps error text consistent across every request helper, and every toast, which shows `message`.
async function errorDetails(
  res: Response,
  fallback: string,
): Promise<{
  message: string
  code?: string
  requestId?: string
  body?: unknown
}> {
  let requestId = res.headers.get("x-request-id") ?? undefined
  try {
    const body = (await res.json()) as {
      error?: string
      code?: string
      requestId?: string
    }
    requestId ??= body.requestId
    return {
      message: withReference(body.error ?? fallback, res.status, requestId),
      code: body.code,
      requestId,
      body,
    }
  } catch {
    return {
      message: withReference(fallback, res.status, requestId),
      requestId,
    }
  }
}

/** Options every request helper accepts on top of fetch's own. */
export type ApiInit = RequestInit & {
  fallbackError: string
  /** Sent as `Idempotency-Key` so the API can replay the first result if this request is repeated. */
  idempotencyKey?: string
}

// Calls the API with the session cookie and returns a typed ok/error result instead of throwing.
// The base for every client-side request helper.
export async function apiRequest<T>(
  path: string,
  init: ApiInit,
): Promise<ApiResult<T>> {
  const { fallbackError, idempotencyKey, body, ...rest } = init
  const headers = {
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    ...rest.headers,
  }
  try {
    const res = await fetch(`${AUTH_URL}/api/v1${path}`, {
      ...rest,
      credentials: "include",
      headers,
      ...(body !== undefined && { body }),
    })
    if (!res.ok)
      return {
        ok: false,
        ...(await errorDetails(res, fallbackError)),
        status: res.status,
      }
    if (res.status === 204) return { ok: true, data: undefined as T }
    return { ok: true, data: (await res.json()) as T }
  } catch {
    return { ok: false, message: "Couldn't reach the server. Try again." }
  }
}
