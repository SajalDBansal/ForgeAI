import z from "zod"
import { collaboratorRoleSchema, invitationStatusSchema, connectionProviderSchema, connectionStatusSchema, projectModeSchema, projectSourceSchema, projectStatusSchema } from "../validations/enum.js"

export type CollaboratorRole = z.infer<typeof collaboratorRoleSchema>

export type InvitationStatus = z.infer<typeof invitationStatusSchema>

export type ConnectionProvider = z.infer<typeof connectionProviderSchema>

export type ConnectionStatus = z.infer<typeof connectionStatusSchema>

export type ProjectStatus = z.infer<typeof projectStatusSchema>

export type ProjectMode = z.infer<typeof projectModeSchema>

export type ProjectSource = z.infer<typeof projectSourceSchema>