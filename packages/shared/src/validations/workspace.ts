import z from "zod";

export const updateWorkspaceSchema = z.object({
    name: z.string().trim().min(1, "Workspace name is required").max(60, "Workspace name is too long"),
})
