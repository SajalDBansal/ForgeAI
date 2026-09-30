import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import type { TemplateDefinition } from "../../src/types.js"

const dir = dirname(fileURLToPath(import.meta.url))
const PORT = 3000

export const nodeApiStarter: TemplateDefinition = {
  name: "node-api-starter",
  version: "1.0.0",
  description: "A small Fastify API with TypeScript",
  tag: "Backend",
  author: "ForgeAI",
  license: "MIT",
  imageName: "forgeai-node-api-starter",
  dir,
  metadata: {
    longDesc:
      "A clean Node.js backend starter with Fastify, TypeScript and one health route. It is meant for APIs, workers and service prototypes.",
    stack: [
      { name: "node", version: "22" },
      { name: "fastify", version: "5.12.5" },
      { name: "typescript", version: "5.9.3" },
    ],
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
      { key: "PORT", desc: "HTTP port for the API server", required: false },
    ],
    includes: [
      "Fastify",
      "TypeScript",
      "Health endpoint",
      "Ready for REST routes",
    ],
    resources: { cpuCount: 2, memoryMB: 2048, diskMB: 10240 },
  },
  runtime: {
    installCommand: "npm install",
    devCommand: `PORT=${PORT} npm run dev`,
    port: PORT,
  },
}
