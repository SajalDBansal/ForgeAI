"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowRight, Mail } from "lucide-react"
import { toast } from "sonner"

import { AuthShell, FormRow, inputCls } from "@/components/auth/auth-shell"
import { authClient } from "@/lib/auth-client"

const RESEND_COOLDOWN_SECONDS = 30

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

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

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await sendResetLink(email)
    if (!ok) return
    setSent(true)
    setCooldown(RESEND_COOLDOWN_SECONDS)
  }

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
          <Link href="/signin" className="text-ink underline underline-offset-4">
            Back to sign in
          </Link>
        }
      >
        <div className="border border-hairline rounded-sm bg-surface-soft p-4 flex items-start gap-3">
          <Mail className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm text-body">
            If <span className="font-medium text-ink">{email}</span> is registered with us, a password
            reset link has been sent to it. Click the link in the email to choose a new password.
          </p>
        </div>

        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0 || loading}
          className="mt-4 text-xs text-mute hover:text-ink underline underline-offset-4 disabled:opacity-50 disabled:no-underline disabled:hover:text-mute"
        >
          {cooldown > 0 ? `Resend email in ${cooldown}s` : loading ? "Resending…" : "Resend email"}
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
          <Link href="/signin" className="text-ink underline underline-offset-4">
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
          className="w-full h-10 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? "Sending…" : "Send reset link"} <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </AuthShell>
  )
}
