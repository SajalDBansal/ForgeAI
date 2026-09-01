import cors from "@fastify/cors"
import Fastify, { type FastifyInstance } from "fastify"
import { ENV_CONFIG } from "./lib/envConfig.js"
import { v1Routers } from "./router/index.js"

export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })

  await app.register(cors, {
    origin: ENV_CONFIG.CLIENT_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    maxAge: 86400,
  })

  await app.register(v1Routers, { prefix: "/api/v1" });

  return app
}
