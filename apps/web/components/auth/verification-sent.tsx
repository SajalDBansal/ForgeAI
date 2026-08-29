"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, MailCheck } from "lucide-react"
import { toast } from "sonner"

import { AuthShell } from "@/components/auth/auth-shell"
import { authClient } from "@/lib/auth-client"

const RESEND_COOLDOWN_SECONDS = 30

export function VerificationSent({ email }: { email: string }) {
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const resend = async () => {
    setLoading(true)
    const { error } = await authClient.sendVerificationEmail({ email })
    setLoading(false)
    if (error) {
      toast.error(error.message ?? "Couldn't send the verification email. Try again.")
      return
    }
    toast("Verification email sent again.")
    setCooldown(RESEND_COOLDOWN_SECONDS)
  }

  return (
    <AuthShell
      title="Verify your email"
      subtitle="One click and your workspace is ready."
      footer={
        <>
          Wrong address?{" "}
          <Link href="/signup" className="text-ink underline underline-offset-4">
            Start over
          </Link>
        </>
      }
    >
      <div className="border border-hairline rounded-sm bg-surface-soft p-4 flex items-start gap-3">
        <MailCheck className="h-4 w-4 mt-0.5 shrink-0 text-success" />
        <p className="text-sm text-body">
          We sent a verification link to <span className="font-medium text-ink">{email}</span>. Open
          it and confirm the address to activate your account — you&apos;ll need to verify before you
          can sign in.
        </p>
      </div>

      <Link
        href="/signin"
        className="mt-4 w-full h-10 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep inline-flex items-center justify-center gap-2"
      >
        Go to sign in <ArrowRight className="h-4 w-4" />
      </Link>

      <div className="mt-4 text-xs text-mute">
        Didn&apos;t get it? Check your spam folder, or{" "}
        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0 || loading}
          className="text-mute hover:text-ink underline underline-offset-4 disabled:opacity-50 disabled:no-underline disabled:hover:text-mute"
        >
          {cooldown > 0 ? `resend in ${cooldown}s` : loading ? "resending…" : "resend the email"}
        </button>
        .
      </div>
    </AuthShell>
  )
}
