import z from "zod";
import { projectModeSchema, projectSourceSchema } from "./enum.js";
import { cuidSchema } from "./shared.js";
import { createProjectRepoSchema } from "./repoRef.js";

export function projectNameFromPrompt(prompt: string): string {
    const slug = prompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 28)
        .replace(/^-|-$/g, "")
    return slug || "new-project"
}

export const createProjectSchema = z.object({
    initialPrompt: z.string().trim().min(1, "Describe what you want to build"),
    mode: projectModeSchema,
    source: projectSourceSchema,
    workspaceId: cuidSchema.optional(),
    repo: createProjectRepoSchema.optional(),
})

export const updateProjectSchema = z
    .object({
        name: z.string().trim().min(1, "Project name is required").max(60, "Project name is too long"),
        description: z.string().trim().max(280, "Project description is too long").nullable(),
    })
    .partial()
    .refine((data) => data.name !== undefined || data.description !== undefined, {
        message: "Provide a name or description to update",
    })
