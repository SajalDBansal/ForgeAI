import type { FastifyReply } from "fastify"

/** An HTTP answer described as data: a status code and the JSON body to send with it. */
export interface HttpResult {
  status: number
  body: unknown
  /** Extra response headers, e.g. Retry-After on a 503. */
  headers?: Record<string, string>
}

// Picks the first validation message from a failed zod parse.
// Used by controllers to answer 400s with one readable reason.
export function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Invalid request"
}

// Sends an HttpResult on the reply.
// Lets a controller build its answer first and send it in one place.
export function sendResult(
  reply: FastifyReply,
  result: HttpResult,
): FastifyReply {
  if (result.headers) reply.headers(result.headers)
  return reply.status(result.status).send(result.body)
}
