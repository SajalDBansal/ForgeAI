import z from "zod"

export const templatePackageSchema = z.object({
  name: z.string().trim().min(1, "Enter the package name"),
  version: z.string().trim().min(1, "Enter the package version"),
})

export const templateConnectionSchema = z.object({
  name: z.string().trim().min(1, "Enter the connection name"),
  kind: z.string().trim().min(1, "Enter the connection kind"),
  required: z.boolean(),
})

export const templateScreenSchema = z.object({
  name: z.string().trim().min(1, "Enter the screen name"),
  path: z.string().trim().min(1, "Enter the screen path"),
  desc: z.string().trim().min(1, "Describe the screen"),
})

export const templateEnvVarSchema = z.object({
  key: z.string().trim().min(1, "Enter the variable name"),
  desc: z.string().trim().min(1, "Describe the variable"),
  required: z.boolean(),
})

export const templateDbTableSchema = z.object({
  table: z.string().trim().min(1, "Enter the table name"),
  cols: z.string().trim().min(1, "Describe the table columns"),
})

/** Sandbox machine size for a template; changing it publishes a new image version. */
export const DEFAULT_TEMPLATE_RESOURCES = {
  cpuCount: 2,
  memoryMB: 2048,
  diskMB: 10240,
}

export const templateResourcesSchema = z.object({
  cpuCount: z
    .number()
    .int()
    .min(1)
    .max(32)
    .default(DEFAULT_TEMPLATE_RESOURCES.cpuCount),
  memoryMB: z
    .number()
    .int()
    .min(512)
    .max(65536)
    .default(DEFAULT_TEMPLATE_RESOURCES.memoryMB),
  diskMB: z
    .number()
    .int()
    .min(1024)
    .max(204800)
    .default(DEFAULT_TEMPLATE_RESOURCES.diskMB),
})

export const templateMetadataSchema = z.object({
  longDesc: z.string().trim().min(1, "Describe the template"),
  stack: z.array(templatePackageSchema).default([]),
  connections: z.array(templateConnectionSchema).default([]),
  deps: z.array(templatePackageSchema).default([]),
  screens: z.array(templateScreenSchema).default([]),
  envVars: z.array(templateEnvVarSchema).default([]),
  includes: z.array(z.string().trim().min(1)).default([]),
  dbSchema: z.array(templateDbTableSchema).optional(),
  /** Defaults to 2 CPUs / 2 GB / 10 GB. */
  resources: templateResourcesSchema.default(DEFAULT_TEMPLATE_RESOURCES),
})

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1, "Enter the template name"),
  description: z.string().trim().min(1, "Describe the template"),
  tag: z.string().trim().min(1, "Enter a tag"),
  version: z.string().trim().min(1, "Enter a version"),
  author: z.string().trim().min(1, "Enter the author"),
  license: z.string().trim().min(1, "Enter a license"),
  storageRef: z.string().trim().min(1, "Enter the storage reference"),
  previewImageUrl: z.url("Enter a valid image URL").nullish(),
  metadata: templateMetadataSchema,
})

export const updateTemplateSchema = createTemplateSchema.partial()
