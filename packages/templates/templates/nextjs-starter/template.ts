import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import type { TemplateDefinition } from "../../src/types.js"

const dir = dirname(fileURLToPath(import.meta.url))

/** The port `next dev` (and the preview) uses. The image itself is the `Dockerfile` next to this file. */
const PORT = 3000

export const nextjsStarter: TemplateDefinition = {
  name: "nextjs-starter",
  version: "1.0.0",
  description: "A minimal Next.js starter with TypeScript and Tailwind CSS",
  tag: "Starter",
  author: "ForgeAI",
  license: "MIT",
  imageName: "forgeai-nextjs-starter",
  dir,
  metadata: {
    longDesc:
      "A minimal Next.js starter — App Router, TypeScript and Tailwind CSS, and nothing else. The default base a new project's sandbox is seeded from.",
    stack: [
      { name: "next", version: "16.3.8" },
      { name: "react", version: "19.2.8" },
      { name: "tailwindcss", version: "4.3.3" },
      { name: "typescript", version: "5.9.3" },
    ],
    connections: [],
    deps: [],
    screens: [
      {
        name: "Home",
        path: "/",
        desc: "A single welcome screen — replace it with your app",
      },
    ],
    envVars: [],
    includes: [
      "App Router",
      "TypeScript",
      "Tailwind CSS v4",
      "No example CRUD screens",
    ],
    // Changing any of these publishes a new version.
    resources: { cpuCount: 2, memoryMB: 2048, diskMB: 10240 },
  },

  runtime: {
    installCommand: "npm install",
    devCommand: `npm run dev -- --hostname 0.0.0.0 --port ${PORT}`,
    port: PORT,
  },
}
