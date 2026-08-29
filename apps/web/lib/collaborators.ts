import type { CollaboratorRole } from "@/lib/types"

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL

export type CollaboratorMutationResult =
  | { ok: true; message: string }
  | { ok: false; message: string }

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    return body.error ?? fallback
  } catch {
    return fallback
  }
}

export async function inviteCollaborator(
  workspaceId: string,
  email: string,
  role: CollaboratorRole,
): Promise<CollaboratorMutationResult> {
  try {
    const res = await fetch(`${AUTH_URL}/api/v1/workspace/${workspaceId}/collaborators/invite`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    })
    if (!res.ok) return { ok: false, message: await errorMessage(res, "Couldn't send that invite.") }

    const body = (await res.json()) as { kind: "collaborator" | "invitation"; emailSent: boolean }
    if (body.kind === "collaborator") {
      return {
        ok: true,
        message: body.emailSent
          ? `${email} now has access to this workspace.`
          : `${email} now has access — but the notification email didn't send.`,
      }
    }
    return {
      ok: true,
      message: body.emailSent
        ? `Invite sent to ${email}. They'll get access once they sign up.`
        : `Invite created for ${email}, but the email didn't send.`,
    }
  } catch {
    return { ok: false, message: "Couldn't reach the server. Try again." }
  }
}

export async function removeCollaborator(
  workspaceId: string,
  collaboratorUserId: string,
  name: string,
): Promise<CollaboratorMutationResult> {
  try {
    const res = await fetch(
      `${AUTH_URL}/api/v1/workspace/${workspaceId}/collaborators/${collaboratorUserId}`,
      { method: "DELETE", credentials: "include" },
    )
    if (!res.ok) return { ok: false, message: await errorMessage(res, `Couldn't remove ${name}.`) }
    return { ok: true, message: `Removed ${name} from this workspace.` }
  } catch {
    return { ok: false, message: "Couldn't reach the server. Try again." }
  }
}
