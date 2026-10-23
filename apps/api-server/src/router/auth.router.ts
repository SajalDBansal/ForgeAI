import { fromNodeHeaders } from "better-auth/node"
import { FastifyInstance, FastifyRequest } from "fastify"
import { auth } from "../lib/auth.js"

// Converts a Fastify request into the web-standard Request better-auth expects.
// Re-serializes the parsed JSON body, since Fastify has already consumed the stream.
function toWebRequest(request: FastifyRequest): Request {
  const url = new URL(request.url, `http://${request.headers.host}`)
  return new Request(url.toString(), {
    method: request.method,
    headers: fromNodeHeaders(request.headers),
    ...(request.body ? { body: JSON.stringify(request.body) } : {}),
  })
}

// Forwards every /auth request to better-auth's web handler.
// Bridges Fastify requests to better-auth's Request/Response API.
export async function authRouter(app: FastifyInstance): Promise<void> {
  app.route({
    method: ["GET", "POST"],
    url: "/*",
    async handler(request, reply) {
      try {
        const response = await auth.handler(toWebRequest(request))

        reply.status(response.status)
        response.headers.forEach((value, key) => reply.header(key, value))
        return reply.send(response.body ? await response.text() : null)
      } catch (error) {
        app.log.error(error, "Authentication Error")
        return reply.status(500).send({
          error: "Internal authentication error",
          code: "AUTH_FAILURE",
        })
      }
    },
  })
}
