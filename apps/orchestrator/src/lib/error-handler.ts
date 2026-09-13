import type { FastifyError, FastifyReply, FastifyRequest } from "fastify"

/** What api-server gets for an unexpected error. It shows this text to users, so no internals. */
const INTERNAL_ERROR = "The sandbox service hit an error."

// Answers any error a route doesn't handle with `{ error }`, the shape api-server reads.
// 4xx keep their message (bad JSON, body too large). Anything else is logged in full under the
// request id and answered with a generic message, so E2B or Redis details never reach a user.
export function handleError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const status =
    error.statusCode && error.statusCode >= 400 && error.statusCode < 500
      ? error.statusCode
      : 500

  if (status >= 500) request.log.error({ err: error }, "Unhandled error")
  else request.log.info({ err: error }, "Request failed")

  if (reply.sent) return
  return reply
    .status(status)
    .send({ error: status >= 500 ? INTERNAL_ERROR : error.message })
}

// Unknown routes get the same `{ error }` shape. Only reached with a valid token (auth runs first).
export function handleNotFound(_request: FastifyRequest, reply: FastifyReply) {
  return reply.status(404).send({ error: "Not found" })
}
