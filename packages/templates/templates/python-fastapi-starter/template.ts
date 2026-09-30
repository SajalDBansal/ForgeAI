import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import type { TemplateDefinition } from "../../src/types.js"

const dir = dirname(fileURLToPath(import.meta.url))
const PORT = 8000

export const pythonFastapiStarter: TemplateDefinition = {
  name: "python-fastapi-starter",
  version: "1.0.0",
  description: "A minimal Python FastAPI service",
  tag: "Backend",
  author: "ForgeAI",
  license: "MIT",
  imageName: "forgeai-python-fastapi-starter",
  dir,
  metadata: {
    longDesc:
      "A small Python API starter with FastAPI and Uvicorn. It is a good default for Python services, ML-adjacent APIs and simple backend prototypes.",
    stack: [
      { name: "python", version: "3" },
      { name: "fastapi", version: "0.115+" },
      { name: "uvicorn", version: "0.30+" },
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
    envVars: [{ key: "PORT", desc: "HTTP port for Uvicorn", required: false }],
    includes: ["FastAPI", "Uvicorn", "Virtual environment", "Health endpoint"],
    resources: { cpuCount: 2, memoryMB: 2048, diskMB: 10240 },
  },
  runtime: {
    installCommand: ".venv/bin/pip install -r requirements.txt",
    devCommand: `.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT}`,
    port: PORT,
  },
}
