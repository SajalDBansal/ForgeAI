import "dotenv/config"

import { createServer } from "./server.js"
import { ENV_CONFIG } from "./lib/envConfig.js"

const port = ENV_CONFIG.PORT ? Number(ENV_CONFIG.PORT) : 3002

const app = await createServer()

try {
  await app.listen({ port, host: "0.0.0.0" })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
