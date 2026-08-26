import z from "zod"

export const createRepoRefSchema = z.object({
    owner: z.string().trim().min(1, "Enter the repository owner"),
    name: z.string().trim().min(1, "Enter the repository name"),
    branch: z.string().trim().min(1, "Enter a branch name"),
    connectionId: z.string().min(1).optional(),
})

export const createProjectRepoSchema = createRepoRefSchema.pick({ owner: true, name: true, branch: true })