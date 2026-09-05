"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { toast } from "sonner"

import { AuthShell, FormRow, inputCls } from "@/components/auth/auth-shell"
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons"
import { VerificationSent } from "@/components/auth/verification-sent"
import { authClient } from "@/lib/auth-client"

// Email/password and social sign-in form.
// Switches to "check your email" when the account isn't verified yet.
export function SigninForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Prefilled from an invite link so the right account signs in.
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "")
  const [pw, setPw] = useState("")
  const [loading, setLoading] = useState(false)
  const [unverified, setUnverified] = useState<string | null>(null)

  // Signs in with email and password; a 403 means the email isn't verified yet.
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await authClient.signIn.email({ email, password: pw })
    setLoading(false)
    if (error) {
      if (error.status === 403) {
        setUnverified(email)
        return
      }
      toast.error(
        error.message ?? "Couldn't sign in. Check your email and password.",
      )
      return
    }
    router.push("/")
    router.refresh()
  }

  if (unverified) return <VerificationSent email={unverified} />

  return (
    <AuthShell
      title="Sign in to ForgeAI"
      subtitle="Pick up where you left off. Your projects and sessions sync across devices."
      footer={
        <>
          New here?{" "}
          <Link
            href="/signup"
            className="text-ink underline underline-offset-4"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <SocialAuthButtons verb="Continue with" />

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
        <FormRow
          label="Password"
          hint={
            <Link href="/forgot-password" className="hover:text-ink">
              Forgot?
            </Link>
          }
        >
          <input
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            type="password"
            required
            placeholder="••••••••"
            className={inputCls}
          />
        </FormRow>

        <button
          type="submit"
          disabled={loading}
          className="bg-ink text-on-primary hover:bg-ink-deep inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}{" "}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </AuthShell>
  )
}
