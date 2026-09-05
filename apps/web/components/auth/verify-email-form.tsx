"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowRight, CircleCheck, Mail, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { AuthShell, FormRow, inputCls } from "@/components/auth/auth-shell"
import { authClient } from "@/lib/auth-client"

type Status = "idle" | "verifying" | "verified" | "failed"

// Confirms an email-verification link, or offers a fresh link when it's invalid.
// Verification runs when the user clicks "Verify my email".
export function VerifyEmailForm({ token }: { token?: string }) {
  const [status, setStatus] = useState<Status>("idle")
  const [email, setEmail] = useState("")
  const [resending, setResending] = useState(false)

  // Verifies the token from the link.
  const verify = async () => {
    if (!token) return
    setStatus("verifying")
    const { error } = await authClient.verifyEmail({ query: { token } })
    if (error) {
      setStatus("failed")
      toast.error(
        error.message ?? "This verification link is invalid or has expired.",
      )
      return
    }
    setStatus("verified")
  }

  // Sends a fresh verification link to the entered email.
  const resend = async (e: FormEvent) => {
    e.preventDefault()
    setResending(true)
    const { error } = await authClient.sendVerificationEmail({ email })
    setResending(false)
    if (error) {
      toast.error(
        error.message ?? "Couldn't send the verification email. Try again.",
      )
      return
    }
    toast("A fresh verification link is on its way.")
  }

  if (status === "verified") {
    return (
      <AuthShell
        title="Email verified"
        subtitle="Your ForgeAI account is active."
        footer={
          <>
            Need help?{" "}
            <Link
              href="/help"
              className="text-ink underline underline-offset-4"
            >
              Contact support
            </Link>
          </>
        }
      >
        <div className="border-hairline bg-surface-soft flex items-start gap-3 rounded-sm border p-4">
          <CircleCheck className="text-success mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-body text-sm">
            Thanks — your address is confirmed. Sign in to open your workspace.
          </p>
        </div>

        <Link
          href="/signin"
          className="bg-ink text-on-primary hover:bg-ink-deep mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm text-sm font-medium"
        >
          Sign in <ArrowRight className="h-4 w-4" />
        </Link>
      </AuthShell>
    )
  }

  if (!token || status === "failed") {
    return (
      <AuthShell
        title="Link no longer valid"
        subtitle="Verification links expire after a while and can only be used once."
        footer={
          <>
            Already verified?{" "}
            <Link
              href="/signin"
              className="text-ink underline underline-offset-4"
            >
              Sign in
            </Link>
          </>
        }
      >
        <div className="border-hairline bg-surface-soft flex items-start gap-3 rounded-sm border p-4">
          <TriangleAlert className="text-warning mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-body text-sm">
            {token
              ? "We couldn't verify this link. Enter your email and we'll send a new one."
              : "This link is missing its verification token. Enter your email and we'll send a new one."}
          </p>
        </div>

        <form onSubmit={resend} className="mt-4 space-y-4">
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
            disabled={resending}
            className="bg-ink text-on-primary hover:bg-ink-deep inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm text-sm font-medium disabled:opacity-50"
          >
            {resending ? "Sending…" : "Send a new link"}{" "}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Confirm your email"
      subtitle="One last step before your workspace opens."
      footer={
        <>
          Wrong account?{" "}
          <Link
            href="/signup"
            className="text-ink underline underline-offset-4"
          >
            Create a new one
          </Link>
        </>
      }
    >
      <div className="border-hairline bg-surface-soft flex items-start gap-3 rounded-sm border p-4">
        <Mail className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-body text-sm">
          You opened the link from your verification email. Confirm below to
          activate your ForgeAI account.
        </p>
      </div>

      <button
        type="button"
        onClick={verify}
        disabled={status === "verifying"}
        className="bg-ink text-on-primary hover:bg-ink-deep mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm text-sm font-medium disabled:opacity-50"
      >
        {status === "verifying" ? "Verifying…" : "Verify my email"}{" "}
        <ArrowRight className="h-4 w-4" />
      </button>
    </AuthShell>
  )
}
