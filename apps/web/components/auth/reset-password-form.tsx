"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { toast } from "sonner"

import { AuthShell, FormRow, inputCls } from "@/components/auth/auth-shell"
import { authClient } from "@/lib/auth-client"

// Form to choose a new password using the token from the reset email.
// Checks the two passwords match before calling the API.
export function ResetPasswordForm({ token }: { token?: string }) {
  const router = useRouter()
  const [pw, setPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [loading, setLoading] = useState(false)

  // Validates the token and passwords, resets, then sends the user to sign in.
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token) {
      toast.error("This reset link is invalid or has expired.")
      return
    }
    if (pw !== confirmPw) {
      toast.error("Passwords don't match.")
      return
    }
    setLoading(true)
    const { error } = await authClient.resetPassword({ newPassword: pw, token })
    setLoading(false)
    if (error) {
      toast.error(
        error.message ??
          "Couldn't reset your password. Request a new link and try again.",
      )
      return
    }
    toast("Password updated. Sign in with your new password.")
    router.push("/signin")
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Pick something you haven't used before."
      footer={
        <>
          Remembered your password?{" "}
          <Link
            href="/signin"
            className="text-ink underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      {!token && (
        <p className="text-danger mb-4 text-sm">
          This reset link is invalid or has expired. Request a new one from the{" "}
          <Link
            href="/forgot-password"
            className="underline underline-offset-4"
          >
            forgot password
          </Link>{" "}
          page.
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        <FormRow label="New password" hint="8+ characters">
          <input
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            type="password"
            required
            minLength={8}
            placeholder="••••••••"
            className={inputCls}
          />
        </FormRow>
        <FormRow label="Confirm password">
          <input
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            type="password"
            required
            minLength={8}
            placeholder="••••••••"
            className={inputCls}
          />
        </FormRow>

        <button
          type="submit"
          disabled={loading || !token}
          className="bg-ink text-on-primary hover:bg-ink-deep inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Changing…" : "Change password"}{" "}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </AuthShell>
  )
}
