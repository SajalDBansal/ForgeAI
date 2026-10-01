import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import type { TemplateDefinition } from "../../src/types.js"

const dir = dirname(fileURLToPath(import.meta.url))
const PORT = 3000

export const runtimeBase: TemplateDefinition = {
  name: "runtime-base",
  version: "1.0.0",
  description:
    "A broad runtime image with Node, Python and Go for imported repos",
  tag: "Runtime",
  author: "ForgeAI",
  license: "MIT",
  imageName: "forgeai-runtime-base",
  dir,
  metadata: {
    longDesc:
      "A broad fallback image for GitHub imports and unknown stacks. It includes Node, Python, Go, build tools and the sandbox contract tools.",
    stack: [
      { name: "node", version: "22" },
      { name: "python", version: "3" },
      { name: "go", version: "system" },
    ],
    connections: [],
    deps: [],
    screens: [
      {
        name: "Runtime check",
        path: "/",
        desc: "A small page confirming the broad runtime image is alive",
      },
    ],
    envVars: [
      {
        key: "PORT",
        desc: "HTTP port for the placeholder server",
        required: false,
      },
    ],
    includes: [
      "Node.js",
      "Python",
      "Go",
      "build-essential",
      "bash",
      "curl",
      "git",
      "gzip",
      "tar",
      "ripgrep",
    ],
    resources: { cpuCount: 2, memoryMB: 2048, diskMB: 10240 },
  },
  runtime: {
    installCommand: "npm install",
    devCommand: `PORT=${PORT} npm run dev`,
    port: PORT,
  },
}
