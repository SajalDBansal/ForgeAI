"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, MailCheck } from "lucide-react"
import { toast } from "sonner"

import { AuthShell } from "@/components/auth/auth-shell"
import {
  RESEND_COOLDOWN_SECONDS,
  useResendCooldown,
} from "@/components/auth/use-resend-cooldown"
import { authClient } from "@/lib/auth-client"

// "Verify your email" screen shown after sign-up or an unverified sign-in.
// Offers a throttled resend of the verification link.
export function VerificationSent({ email }: { email: string }) {
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useResendCooldown(RESEND_COOLDOWN_SECONDS)

  // Re-sends the verification email and restarts the cooldown.
  const resend = async () => {
    setLoading(true)
    const { error } = await authClient.sendVerificationEmail({ email })
    setLoading(false)
    if (error) {
      toast.error(
        error.message ?? "Couldn't send the verification email. Try again.",
      )
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
          <Link
            href="/signup"
            className="text-ink underline underline-offset-4"
          >
            Start over
          </Link>
        </>
      }
    >
      <div className="border-hairline bg-surface-soft flex items-start gap-3 rounded-sm border p-4">
        <MailCheck className="text-success mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-body text-sm">
          We sent a verification link to{" "}
          <span className="text-ink font-medium">{email}</span>. Open it and
          confirm the address to activate your account — you&apos;ll need to
          verify before you can sign in.
        </p>
      </div>

      <Link
        href="/signin"
        className="bg-ink text-on-primary hover:bg-ink-deep mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm text-sm font-medium"
      >
        Go to sign in <ArrowRight className="h-4 w-4" />
      </Link>

      <div className="text-mute mt-4 text-xs">
        Didn&apos;t get it? Check your spam folder, or{" "}
        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0 || loading}
          className="text-mute hover:text-ink disabled:hover:text-mute underline underline-offset-4 disabled:no-underline disabled:opacity-50"
        >
          {cooldown > 0
            ? `resend in ${cooldown}s`
            : loading
              ? "resending…"
              : "resend the email"}
        </button>
        .
      </div>
    </AuthShell>
  )
}
