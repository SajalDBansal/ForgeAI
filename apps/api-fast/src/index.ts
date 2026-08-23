import "dotenv/config"

import { createServer } from "./server.js"

const port = process.env.PORT ? Number(process.env.PORT) : 3002

const app = await createServer()

try {
  await app.listen({ port, host: "0.0.0.0" })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
