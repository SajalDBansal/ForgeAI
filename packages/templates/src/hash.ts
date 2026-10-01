import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { listTemplateFiles } from "./code.js"
import { readTemplateDockerfile } from "./registry.js"
import type { TemplateDefinition } from "./types.js"

// Fingerprints a template's `code/`, its Dockerfile and machine size.
// The sync skips rebuilding when this matches the published hash; prose metadata is excluded.
export async function templateContentHash(
  template: TemplateDefinition,
): Promise<string> {
  const codeDir = join(template.dir, "code")
  const hash = createHash("sha256")

  for (const path of await listTemplateFiles(codeDir)) {
    hash.update(path)
    hash.update("\0")
    hash.update(await readFile(join(codeDir, path)))
    hash.update("\0")
  }

  // The image recipe: changing the Dockerfile publishes a new version.
  hash.update(readTemplateDockerfile(template))

  // Machine size is part of a version: changing it forces a rebuild.
  hash.update(JSON.stringify(template.metadata.resources))

  return hash.digest("hex")
}
