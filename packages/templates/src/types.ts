import type { TemplateMetadata } from "@forgeAI/shared"

/**
 * One template as declared in its `template.ts`; the sync turns it into the R2 zip, the sandbox image
 * and the DB rows. The image is built from the `Dockerfile` in the template's folder (F8).
 */
export interface TemplateDefinition {
  /** Slug — the folder name, the `Template.name` column, and the R2 prefix. */
  name: string
  /** Bump by hand whenever `code/` changes; R2 keeps every version published. */
  version: string
  description: string
  tag: string
  author: string
  license: string
  /** Name the image is published under at the provider (per version, see `templateImageName`). Global per account, hence prefixed. */
  imageName: string
  /** Absolute path of the template's own folder — the one holding `code/` and the `Dockerfile`. */
  dir: string
  /** Everything the UI shows on the template's detail page. */
  metadata: TemplateMetadata
  /** How projects from this template start their dev server; projects may override it. Not hashed. */
  runtime: {
    /** Quoted when a dev server fails on a missing module. Never run automatically. */
    installCommand: string
    /** What the Start button runs. Must listen on `port` below. */
    devCommand: string
    /** The port `devCommand` listens on, and the port the preview URL maps. */
    port: number
  }
}
