import "dotenv/config"

import { createServer } from "./server.js"

const port = process.env.PORT ? Number(process.env.PORT) : 3001
const server = createServer()

server.listen(port, () => {
  console.log(`api running on http://localhost:${port}`)
})
