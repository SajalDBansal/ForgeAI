import fp from "fastify-plugin"
import type { FastifyError } from "fastify"
import { Prisma } from "@forgeAI/database"

const INTERNAL_ERROR = "Something went wrong. Please try again."

interface HttpError {
  status: number
  message: string
}

// Maps a thrown error to the status and message the client should see.
// Only safe messages go out; anything unexpected becomes a generic 500.
function toHttpError(error: FastifyError): HttpError {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") return { status: 404, message: "Not found" }
    if (error.code === "P2002")
      return { status: 409, message: "That already exists" }
  }

  // Fastify's own client errors (bad JSON, body too large, ...) carry a 4xx and a safe message.
  const status = error.statusCode ?? 500
  if (status >= 400 && status < 500) return { status, message: error.message }

  return { status: 500, message: INTERNAL_ERROR }
}

// Catches every error a route doesn't handle and answers with the usual `{ error }` shape.
// Keeps upstream details (GitHub, Prisma, ...) in the logs instead of the response.
// A 500 also carries the request id, which finds the full error in the logs.
export default fp(async (fastify) => {
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const { status, message } = toHttpError(error)

    if (status >= 500) request.log.error({ err: error }, "Unhandled error")
    else request.log.info({ err: error }, "Request failed")

    if (reply.sent) return
    return reply
      .status(status)
      .send({ error: message, ...(status >= 500 && { requestId: request.id }) })
  })

  fastify.setNotFoundHandler((request, reply) => {
    return reply
      .status(404)
      .send({ error: `Route ${request.method} ${request.url} not found` })
  })
})
