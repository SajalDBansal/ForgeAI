import cors from "@fastify/cors"
import Fastify, { type FastifyInstance } from "fastify"

import { prisma } from "@forgeAI/database"

export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })

  await app.register(cors)


  return app
}
