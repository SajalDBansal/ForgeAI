import type { Metadata } from "next"

import { InviteView } from "@/components/invite/invite-view"

export const metadata: Metadata = { title: "You've been invited — ForgeAI" }

// Invitation page for a workspace invite link.
// Opened from the invite email.
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <InviteView token={token} />
}
