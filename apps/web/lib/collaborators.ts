import { apiRequest, isInProgress } from "@/lib/api-client"
import type { CollaboratorRole } from "@/lib/types"

export type CollaboratorMutationResult =
  | { ok: true; message: string }
  | { ok: false; message: string; inProgress?: boolean }

type InviteResponse = {
  kind: "collaborator" | "invitation"
  emailQueued: boolean
}

// Builds the confirmation message for an invite, depending on what happened.
// Existing users get access now; new ones get an email invitation.
function inviteMessage(
  email: string,
  { kind, emailQueued }: InviteResponse,
): string {
  if (kind === "collaborator") {
    return emailQueued
      ? `${email} now has access to this workspace.`
      : `${email} now has access, but the notification could not be queued.`
  }
  return emailQueued
    ? `Invite created for ${email}. The email is queued for delivery.`
    : `Invite created for ${email}, but the email could not be queued.`
}

// Invites someone to a workspace by email with the given role.
// Used by the workspace detail page's invite form; the key keeps a retry from inviting twice.
export async function inviteCollaborator(
  workspaceId: string,
  email: string,
  role: CollaboratorRole,
  idempotencyKey?: string,
): Promise<CollaboratorMutationResult> {
  const result = await apiRequest<InviteResponse>(
    `/workspace/${workspaceId}/collaborators/invite`,
    {
      method: "POST",
      body: JSON.stringify({ email, role }),
      idempotencyKey,
      fallbackError: "Couldn't send that invite.",
    },
  )
  if (!result.ok)
    return {
      ok: false,
      message: result.message,
      inProgress: isInProgress(result),
    }
  return { ok: true, message: inviteMessage(email, result.data) }
}

// Removes a collaborator from a workspace (or leaves it, when it's yourself).
// Used by the workspace detail page and the "Leave workspace" action.
export async function removeCollaborator(
  workspaceId: string,
  collaboratorUserId: string,
  name: string,
): Promise<CollaboratorMutationResult> {
  const result = await apiRequest<void>(
    `/workspace/${workspaceId}/collaborators/${collaboratorUserId}`,
    {
      method: "DELETE",
      fallbackError: `Couldn't remove ${name}.`,
    },
  )
  if (!result.ok) return { ok: false, message: result.message }
  return { ok: true, message: `Removed ${name} from this workspace.` }
}
