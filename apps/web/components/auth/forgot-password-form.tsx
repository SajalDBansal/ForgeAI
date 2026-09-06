"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowRight, Mail } from "lucide-react"
import { toast } from "sonner"

import { AuthShell, FormRow, inputCls } from "@/components/auth/auth-shell"
import {
  RESEND_COOLDOWN_SECONDS,
  useResendCooldown,
} from "@/components/auth/use-resend-cooldown"
import { authClient } from "@/lib/auth-client"

// Requests a password-reset email, then shows "check your email" with a throttled resend.
// Never reveals whether an address is registered.
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useResendCooldown(0)

  // Sends the reset email; returns whether it worked.
  const sendResetLink = async (targetEmail: string) => {
    setLoading(true)
    const { error } = await authClient.requestPasswordReset({
      email: targetEmail,
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) {
      toast.error(error.message ?? "Couldn't send the reset email. Try again.")
      return false
    }
    return true
  }

  // Sends the first reset link and switches to the "sent" screen.
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await sendResetLink(email)
    if (!ok) return
    setSent(true)
    setCooldown(RESEND_COOLDOWN_SECONDS)
  }

  // Re-sends the reset link and restarts the cooldown.
  const resend = async () => {
    const ok = await sendResetLink(email)
    if (!ok) return
    toast("Reset link sent again.")
    setCooldown(RESEND_COOLDOWN_SECONDS)
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="We'll send a reset link if the address is registered."
        footer={
          <Link
            href="/signin"
            className="text-ink underline underline-offset-4"
          >
            Back to sign in
          </Link>
        }
      >
        <div className="border-hairline bg-surface-soft flex items-start gap-3 rounded-sm border p-4">
          <Mail className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-body text-sm">
            If <span className="text-ink font-medium">{email}</span> is
            registered with us, a password reset link has been sent to it. Click
            the link in the email to choose a new password.
          </p>
        </div>

        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0 || loading}
          className="text-mute hover:text-ink disabled:hover:text-mute mt-4 text-xs underline underline-offset-4 disabled:no-underline disabled:opacity-50"
        >
          {cooldown > 0
            ? `Resend email in ${cooldown}s`
            : loading
              ? "Resending…"
              : "Resend email"}
        </button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to reset it."
      footer={
        <>
          Remembered it?{" "}
          <Link
            href="/signin"
            className="text-ink underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FormRow label="Email">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="you@studio.dev"
            className={inputCls}
          />
        </FormRow>

        <button
          type="submit"
          disabled={loading}
          className="bg-ink text-on-primary hover:bg-ink-deep inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Sending…" : "Send reset link"}{" "}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </AuthShell>
  )
}
