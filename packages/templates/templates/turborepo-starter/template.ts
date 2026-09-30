import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import type { TemplateDefinition } from "../../src/types.js"

const dir = dirname(fileURLToPath(import.meta.url))
const PORT = 3000

export const turborepoStarter: TemplateDefinition = {
  name: "turborepo-starter",
  version: "1.0.0",
  description:
    "A small Turborepo with React web, Fastify API and shared TypeScript",
  tag: "Monorepo",
  author: "ForgeAI",
  license: "MIT",
  imageName: "forgeai-turborepo-starter",
  dir,
  metadata: {
    longDesc:
      "A compact monorepo starter for products that need a web app, an API and shared TypeScript from the beginning.",
    stack: [
      { name: "turbo", version: "2.10.12" },
      { name: "react", version: "19.2.8" },
      { name: "fastify", version: "5.12.5" },
      { name: "typescript", version: "5.9.3" },
    ],
    connections: [],
    deps: [],
    screens: [
      { name: "Web", path: "/", desc: "React app served by Vite on port 3000" },
      {
        name: "API health",
        path: "/healthz",
        desc: "Fastify API endpoint on port 3001",
      },
    ],
    envVars: [],
    includes: [
      "Turborepo",
      "npm workspaces",
      "React web app",
      "Fastify API",
      "Shared package",
    ],
    resources: { cpuCount: 2, memoryMB: 2048, diskMB: 10240 },
  },
  runtime: {
    installCommand: "npm install",
    devCommand: "npm run dev",
    port: PORT,
  },
}
