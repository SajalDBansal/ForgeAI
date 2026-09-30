import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import type { TemplateDefinition } from "../../src/types.js"

const dir = dirname(fileURLToPath(import.meta.url))
const PORT = 8080

export const goApiStarter: TemplateDefinition = {
  name: "go-api-starter",
  version: "1.0.0",
  description: "A minimal Go HTTP API",
  tag: "Backend",
  author: "ForgeAI",
  license: "MIT",
  imageName: "forgeai-go-api-starter",
  dir,
  metadata: {
    longDesc:
      "A small Go API starter using the standard library. It is a fast base for services, CLIs that expose HTTP and compiled backends.",
    stack: [{ name: "go", version: "system" }],
    connections: [],
    deps: [],
    screens: [
      {
        name: "Health",
        path: "/healthz",
        desc: "A simple JSON health endpoint",
      },
    ],
    envVars: [
      { key: "PORT", desc: "HTTP port for the Go server", required: false },
    ],
    includes: [
      "Go standard library HTTP server",
      "Health endpoint",
      "No framework dependency",
    ],
    resources: { cpuCount: 2, memoryMB: 2048, diskMB: 10240 },
  },
  runtime: {
    installCommand: "go mod download",
    devCommand: `PORT=${PORT} go run .`,
    port: PORT,
  },
}
