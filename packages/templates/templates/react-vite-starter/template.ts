import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import type { TemplateDefinition } from "../../src/types.js"

const dir = dirname(fileURLToPath(import.meta.url))
const PORT = 5173

export const reactViteStarter: TemplateDefinition = {
  name: "react-vite-starter",
  version: "1.0.0",
  description: "A lightweight React app with Vite, TypeScript and plain CSS",
  tag: "Frontend",
  author: "ForgeAI",
  license: "MIT",
  imageName: "forgeai-react-vite-starter",
  dir,
  metadata: {
    longDesc:
      "A small React and Vite starter for client-heavy apps. It keeps the first screen simple so the agent can replace it quickly.",
    stack: [
      { name: "react", version: "19.2.8" },
      { name: "vite", version: "6" },
      { name: "typescript", version: "5.9.3" },
    ],
    connections: [],
    deps: [],
    screens: [
      { name: "Home", path: "/", desc: "A simple React landing screen" },
    ],
    envVars: [],
    includes: ["React", "Vite", "TypeScript", "Plain CSS"],
    resources: { cpuCount: 2, memoryMB: 2048, diskMB: 10240 },
  },
  runtime: {
    installCommand: "npm install",
    devCommand: `npm run dev -- --host 0.0.0.0 --port ${PORT}`,
    port: PORT,
  },
}
