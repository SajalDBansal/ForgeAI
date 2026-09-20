import z from "zod"
import { collaboratorRoleSchema } from "./enum.js"

export const inviteCollaboratorSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address")),
  role: collaboratorRoleSchema,
})

export const updateCollaboratorRoleSchema = z.object({
  role: collaboratorRoleSchema,
})
