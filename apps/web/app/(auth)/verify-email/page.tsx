import type { Metadata } from "next"

import { VerifyEmailForm } from "@/components/auth/verify-email-form"

export const metadata: Metadata = { title: "Verify your email — ForgeAI" }

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return <VerifyEmailForm token={token} />
}
