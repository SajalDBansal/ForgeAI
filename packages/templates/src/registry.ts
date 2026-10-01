import { readFileSync } from "node:fs"
import { join } from "node:path"

import { goApiStarter } from "../templates/go-api-starter/template.js"
import { nodeApiStarter } from "../templates/node-api-starter/template.js"
import { nextjsStarter } from "../templates/nextjs-starter/template.js"
import { pythonFastapiStarter } from "../templates/python-fastapi-starter/template.js"
import { reactViteStarter } from "../templates/react-vite-starter/template.js"
import { runtimeBase } from "../templates/runtime-base/template.js"
import { turborepoStarter } from "../templates/turborepo-starter/template.js"
import type { TemplateDefinition } from "./types.js"

/** Every template this repo publishes: a folder under `templates/` plus a line here. */
export const TEMPLATES: TemplateDefinition[] = [
  nextjsStarter,
  reactViteStarter,
  nodeApiStarter,
  pythonFastapiStarter,
  goApiStarter,
  turborepoStarter,
  runtimeBase,
]

// Looks up a template definition by its slug.
// Used by scripts that operate on a single named template.
export function findTemplate(name: string): TemplateDefinition | undefined {
  return TEMPLATES.find((template) => template.name === name)
}

// Builds the R2 key of a template version's source zip.
// Each version has its own key, so older versions stay downloadable.
export function storageRef(
  folder: string,
  name: string,
  version: string,
): string {
  return `${folder}/${name}/${version}.zip`
}

// Reads the Dockerfile a template's image is built from (its folder's `Dockerfile`, F8).
// Hashed into the version, built by the provider, and stored with the version in the database.
export function readTemplateDockerfile(template: TemplateDefinition): string {
  return readFileSync(join(template.dir, "Dockerfile"), "utf8")
}
