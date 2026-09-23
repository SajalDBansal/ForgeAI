import { apiRequest, type ApiResult } from "@/lib/api-client"
import type { InvitationPreview } from "@/lib/types"

// localStorage so it survives the email-verification link opening in a new tab; cleared on read.
const PENDING_INVITE_KEY = "forge.pendingInviteToken"

// Stores an invite token to redeem after the user signs in or signs up.
// Used by the invite page before sending people to auth.
export function rememberPendingInvite(token: string): void {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, token)
  } catch {
    // Storage blocked (private mode, full): the invite link still works if opened again.
  }
}

// Reads and clears the pending invite token so it's only ever used once.
// Called after sign-in to finish accepting the invite.
export function takePendingInvite(): string | null {
  try {
    const token = localStorage.getItem(PENDING_INVITE_KEY)
    if (token) localStorage.removeItem(PENDING_INVITE_KEY)
    return token
  } catch {
    return null
  }
}

// Loads the public preview of an invitation by token.
// Backs the /invite/[token] page.
export function getInvitationPreviewRequest(
  token: string,
): Promise<ApiResult<InvitationPreview>> {
  return apiRequest(`/invite/${token}`, {
    fallbackError: "This invite link isn't valid.",
  })
}

// Accepts an invitation as the signed-in user.
// Returns the workspace id to open afterwards.
export function acceptInvitationRequest(
  token: string,
): Promise<ApiResult<{ workspaceId: string }>> {
  return apiRequest(`/invite/${token}/accept`, {
    method: "POST",
    fallbackError: "Couldn't accept that invite. Try again.",
  })
}
