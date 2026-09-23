import { AsyncLocalStorage, AsyncResource } from "node:async_hooks"

import fp from "fastify-plugin"
import { REQUEST_ID_HEADER } from "@forgeAI/shared"

// Remembers which request the current code is running for, without passing it through every
// function. callOrchestrator reads it to send the request id on; background work a request
// starts (creating a GitHub repo, say) keeps it too.

interface RequestContext {
  requestId: string
}

const context = new AsyncLocalStorage<RequestContext>()
const resources = new WeakMap<object, AsyncResource>()

// Returns the id of the request the current code is running for, if any.
// Undefined outside a request (start-up, timers).
export function currentRequestId(): string | undefined {
  return context.getStore()?.requestId
}

// Enters the request's context for the rest of its life, and echoes its id on every response.
export default fp(async (fastify) => {
  fastify.addHook("onRequest", (request, _reply, done) => {
    context.run({ requestId: request.id }, () => {
      const resource = new AsyncResource("forgeai-request")
      resources.set(request, resource)
      resource.runInAsyncScope(done)
    })
  })

  // Reading a request body leaves the context behind (stream events), so it's entered again
  // before validation and the handler run. The same pattern @fastify/request-context uses.
  fastify.addHook("preValidation", (request, _reply, done) => {
    const resource = resources.get(request)
    if (resource) resource.runInAsyncScope(done)
    else done()
  })

  fastify.addHook("onSend", async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id)
  })
})
