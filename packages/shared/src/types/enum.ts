import z from "zod"
import {
  agentRunStatusSchema,
  collaboratorRoleSchema,
  invitationStatusSchema,
  connectionProviderSchema,
  connectionStatusSchema,
  fileChangeActionSchema,
  projectModeSchema,
  projectSourceSchema,
  projectStatusSchema,
  usageKindSchema,
} from "../validations/enum.js"

export type CollaboratorRole = z.infer<typeof collaboratorRoleSchema>

export type InvitationStatus = z.infer<typeof invitationStatusSchema>

export type ConnectionProvider = z.infer<typeof connectionProviderSchema>

export type ConnectionStatus = z.infer<typeof connectionStatusSchema>

export type ProjectStatus = z.infer<typeof projectStatusSchema>

export type ProjectMode = z.infer<typeof projectModeSchema>

export type ProjectSource = z.infer<typeof projectSourceSchema>

export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>

export type FileChangeAction = z.infer<typeof fileChangeActionSchema>

export type UsageKind = z.infer<typeof usageKindSchema>
