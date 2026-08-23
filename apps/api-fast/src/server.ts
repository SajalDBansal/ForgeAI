import cors from "@fastify/cors"
import Fastify, { type FastifyInstance } from "fastify"

import { prisma } from "@repo/database"

export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })

  await app.register(cors)

  app.get("/status", async () => {
    return { ok: true }
  })

  app.get("/users", async () => {
    return prisma.user.findMany({ include: { posts: true } })
  })

  app.get<{ Params: { name: string } }>("/message/:name", async (request) => {
    return { message: `hello ${request.params.name}` }
  })

  return app
}
