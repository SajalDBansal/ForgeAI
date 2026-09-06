import type { Metadata } from "next"

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

export const metadata: Metadata = { title: "Reset password — ForgeAI" }

// Page to request a password reset email.
// For users who forgot their password.
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
