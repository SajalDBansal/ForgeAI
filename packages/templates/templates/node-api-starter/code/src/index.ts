import Fastify from "fastify"

const port = Number(process.env.PORT ?? 3000)
const app = Fastify({ logger: true })

app.get("/", async () => ({
  name: "node-api-starter",
  message: "Your Fastify API is running.",
}))

app.get("/healthz", async () => ({ ok: true }))

app.listen({ host: "0.0.0.0", port }).catch((error) => {
  app.log.error(error)
  process.exit(1)
})
