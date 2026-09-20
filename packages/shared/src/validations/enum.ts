import z from "zod"

export const collaboratorRoleSchema = z.enum(["EDITOR", "VIEWER"])

export const invitationStatusSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "REVOKED",
  "EXPIRED",
])

export const connectionProviderSchema = z.enum([
  "GITHUB",
  "VERCEL",
  "RENDER",
  "SUPABASE",
])

export const connectionStatusSchema = z.enum([
  "CONNECTED",
  "EXPIRED",
  "REVOKED",
])

export const projectStatusSchema = z.enum([
  "BUILDING",
  "READY",
  "PLANNING",
  "NEEDS_INPUT",
])

export const projectModeSchema = z.enum(["BUILD", "PLAN"])

export const projectSourceSchema = z.enum(["GITHUB", "MANUAL"])

export const agentRunStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "WAITING_INPUT",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
])

export const fileChangeActionSchema = z.enum(["CREATED", "UPDATED", "DELETED"])

export const usageKindSchema = z.enum([
  "LLM_TOKENS",
  "EMBEDDING_TOKENS",
  "SANDBOX_SECONDS",
])
