import z from "zod";

/** `stack` and `deps` share a shape: a named package pinned to a version. */
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

export const templateMetadataSchema = z.object({
    longDesc: z.string().trim().min(1, "Describe the template"),
    stack: z.array(templatePackageSchema).default([]),
    connections: z.array(templateConnectionSchema).default([]),
    deps: z.array(templatePackageSchema).default([]),
    screens: z.array(templateScreenSchema).default([]),
    envVars: z.array(templateEnvVarSchema).default([]),
    includes: z.array(z.string().trim().min(1)).default([]),
    dbSchema: z.array(templateDbTableSchema).optional(),
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
