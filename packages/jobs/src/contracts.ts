import { z } from "zod"

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)
export const workerRoleSchema = z.enum([
  "audit",
  "cleanup",
  "github",
  "notification",
])
export type WorkerRole = z.infer<typeof workerRoleSchema>

export const auditSchema = z.object({
  action: z.enum([
    "project.created",
    "project.archived",
    "project.restored",
    "project.deleted",
    "workspace.archived",
    "workspace.restored",
    "workspace.deleted",
    "secret.saved",
    "secret.deleted",
    "secret.revealed",
    "collaborator.added",
    "collaborator.role_changed",
    "collaborator.removed",
    "invitation.created",
    "invitation.revoked",
    "invitation.accepted",
  ]),
  actorId: id.optional(),
  workspaceId: id.optional(),
  projectId: id.optional(),
  targetId: id.optional(),
  role: z.enum(["EDITOR", "VIEWER"]).optional(),
})
export type AuditEvent = z.infer<typeof auditSchema>

export const taskSchema = z.discriminatedUnion("type", [
  // Retained for audit jobs accepted before direct transactional audit writes.
  z.object({ type: z.literal("audit.record"), event: auditSchema }),
  z.object({ type: z.literal("project.storage.delete"), projectId: id }),
  z.object({ type: z.literal("project.knowledge.delete"), projectId: id }),
  z.object({ type: z.literal("github.setup"), projectId: id, actorId: id }),
  z.object({ type: z.literal("github.prepare"), projectId: id, actorId: id }),
  z.object({
    type: z.literal("email.invitation"),
    invitationId: id,
    tokenVersion: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({
    type: z.literal("email.access"),
    collaboratorId: id,
    actorId: id,
  }),
])
export type BackgroundTask = z.infer<typeof taskSchema>

export function roleForTask(task: BackgroundTask): WorkerRole {
  switch (task.type) {
    case "audit.record":
      return "audit"
    case "project.storage.delete":
    case "project.knowledge.delete":
      return "cleanup"
    case "github.setup":
    case "github.prepare":
      return "github"
    case "email.invitation":
    case "email.access":
      return "notification"
  }
}

export function queueName(role: WorkerRole): string {
  return `forgeai-${role}`
}

export const MAX_JOB_ATTEMPTS = 6
export function retryDelay(attempts: number): number {
  return Math.min(300_000, 1_000 * 2 ** Math.max(0, attempts - 1))
}

export class PermanentJobError extends Error {
  readonly code:
    | "invalid_payload"
    | "stale_notification"
    | "github_uncertain"
    | "github_permission"
  constructor(code: PermanentJobError["code"]) {
    super(code)
    this.code = code
  }
}
