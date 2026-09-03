import z from "zod"
import {
  createTemplateSchema,
  templateConnectionSchema,
  templateDbTableSchema,
  templateEnvVarSchema,
  templateMetadataSchema,
  templatePackageSchema,
  templateScreenSchema,
  updateTemplateSchema,
} from "../validations/template.js"

export type TemplatePackage = z.infer<typeof templatePackageSchema>

export type TemplateConnection = z.infer<typeof templateConnectionSchema>

export type TemplateScreen = z.infer<typeof templateScreenSchema>

export type TemplateEnvVar = z.infer<typeof templateEnvVarSchema>

export type TemplateDbTable = z.infer<typeof templateDbTableSchema>

export type TemplateMetadata = z.infer<typeof templateMetadataSchema>

export type CreateTemplateDataType = z.infer<typeof createTemplateSchema>

export type UpdateTemplateDataType = z.infer<typeof updateTemplateSchema>

export type Template = {
  id: string
  name: string
  description: string
  tag: string
  version: string
  author: string
  license: string
  uses: number
  storageRef: string
  /** The image the current version boots from, as the provider names it. */
  imageRef: string
  /** Which sandbox provider that image was built for. */
  provider: string
  previewImageUrl: string | null
  metadata: unknown
  createdAt: Date
  updatedAt: Date
  workspaceId: string | null
}

/** A short-lived R2 link to a template's source zip, for local download. Sandboxes use the built image instead. */
export type TemplateDownload = {
  url: string
  filename: string
  expiresIn: number
}

export type TemplateListItem = Pick<
  Template,
  | "id"
  | "name"
  | "tag"
  | "description"
  | "storageRef"
  | "previewImageUrl"
  | "workspaceId"
>

export type TemplateInfo = Omit<Template, "metadata"> & TemplateMetadata

// Flattens a template row's JSON metadata into typed top-level fields.
// Used by the template API before sending details to the browser.
export function toTemplateInfo(row: Template): TemplateInfo {
  const { metadata, ...columns } = row
  return {
    ...columns,
    ...templateMetadataSchema.parse(metadata),
  }
}

// Builds the per-version image name, e.g. `forgeai-nextjs-starter-v1-0-1`.
// Each version gets its own immutable image so projects never shift underneath.
export function templateImageName(imageName: string, version: string): string {
  return `${imageName}-v${version.replace(/\./g, "-")}`
}

// Recovers the base E2B name from a versioned or legacy `name:tag` image.
// Used to match an image back to the template it belongs to.
export function templateImageBase(image: string): string {
  return image.replace(/:.*$/, "").replace(/-v\d+-\d+-\d+$/, "")
}
