import z from "zod"
import { projectModeSchema, projectSourceSchema } from "./enum.js"
import { cuidSchema } from "./shared.js"
import { createProjectRepoSchema } from "./repoRef.js"

// Turns a prompt into a short kebab-case project name.
// Used when a project is created without an explicit name.
export function projectNameFromPrompt(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 28)
    .replace(/^-|-$/g, "")
  return slug || "new-project"
}

export const createProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Project name is required")
      .max(60, "Project name is too long")
      .optional(),
    initialPrompt: z.string().trim().max(4000, "That's too long").optional(),
    mode: projectModeSchema,
    source: projectSourceSchema,
    workspaceId: cuidSchema.optional(),
    repo: createProjectRepoSchema.optional(),
    templateId: cuidSchema.optional(),
  })
  .refine((data) => !!data.initialPrompt?.trim() || !!data.templateId, {
    message: "Describe what you want to build, or choose a template",
    path: ["initialPrompt"],
  })

export const updateProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Project name is required")
      .max(60, "Project name is too long"),
    description: z
      .string()
      .trim()
      .max(280, "Project description is too long")
      .nullable(),
  })
  .partial()
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: "Provide a name or description to update",
  })
