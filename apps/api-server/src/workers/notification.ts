import { createHash } from "node:crypto"
import { prisma } from "@forgeAI/database"
import { PermanentJobError } from "@forgeAI/jobs"
import type { TaskHandler } from "@forgeAI/jobs/worker"
import {
  sendWorkspaceAccessGrantedEmail,
  sendWorkspaceInvitationEmail,
} from "../lib/email.js"

export const handle: TaskHandler = async (task, record) => {
  // Provider deduplication expires after 24 hours; never blindly replay an older send.
  if (Date.now() - record.createdAt.getTime() > 23 * 60 * 60 * 1_000)
    throw new PermanentJobError("stale_notification")
  if (task.type === "email.invitation") {
    const row = await prisma.invitation.findUnique({
      where: { id: task.invitationId },
      include: { workspace: true, invitedBy: { select: { name: true } } },
    })
    if (
      !row ||
      row.status !== "PENDING" ||
      row.expiresAt <= new Date() ||
      row.workspace.archivedAt
    )
      return
    if (
      createHash("sha256").update(row.token).digest("hex") !== task.tokenVersion
    )
      return
    if (row.workspace.userId !== row.invitedByUserId) return
    await sendWorkspaceInvitationEmail(
      {
        to: row.email,
        workspaceName: row.workspace.name,
        invitedByName: row.invitedBy.name,
        token: row.token,
      },
      record.id,
    )
  } else if (task.type === "email.access") {
    const row = await prisma.collaborator.findUnique({
      where: { id: task.collaboratorId },
      include: { workspace: true, user: { select: { email: true } } },
    })
    if (
      !row ||
      row.workspace.archivedAt ||
      row.workspace.userId !== task.actorId
    )
      return
    const actor = await prisma.user.findUnique({
      where: { id: task.actorId },
      select: { name: true },
    })
    if (!actor) return
    await sendWorkspaceAccessGrantedEmail(
      {
        to: row.user.email,
        workspaceName: row.workspace.name,
        invitedByName: actor.name,
      },
      record.id,
    )
  } else throw new PermanentJobError("invalid_payload")
}
