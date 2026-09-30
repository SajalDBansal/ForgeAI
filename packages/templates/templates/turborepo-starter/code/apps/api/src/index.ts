import Fastify from "fastify"
import { productName } from "@forgeai-template/shared"

const app = Fastify({ logger: true })
const port = Number(process.env.PORT ?? 3001)

app.get("/", async () => ({ name: productName, service: "api" }))
app.get("/healthz", async () => ({ ok: true }))

app.listen({ host: "0.0.0.0", port }).catch((error) => {
  app.log.error(error)
  process.exit(1)
})
