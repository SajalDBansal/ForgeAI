"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { toast } from "sonner"

import { AuthShell, FormRow, inputCls } from "@/components/auth/auth-shell"
import { VerificationSent } from "@/components/auth/verification-sent"
import { GithubIcon } from "@/components/brand/github-icon"
import { GoogleIcon } from "@/components/brand/google-icon"
import { authClient } from "@/lib/auth-client"

export function SigninForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [pw, setPw] = useState("")
  const [loading, setLoading] = useState(false)
  const [unverified, setUnverified] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await authClient.signIn.email({ email, password: pw })
    setLoading(false)
    if (error) {
      // api-fast blocks unverified addresses with a 403 and re-sends the
      // verification email, so send the user to the same waiting state signup uses.
      if (error.status === 403) {
        setUnverified(email)
        return
      }
      toast.error(error.message ?? "Couldn't sign in. Check your email and password.")
      return
    }
    router.push("/")
    router.refresh()
  }

  const socialSignin = async (provider: "github" | "google") => {
    const { error } = await authClient.signIn.social({ provider, callbackURL: "/" })
    if (error) toast.error(error.message ?? `Couldn't continue with ${provider}.`)
  }

  if (unverified) return <VerificationSent email={unverified} />

  return (
    <AuthShell
      title="Sign in to ForgeAI"
      subtitle="Pick up where you left off. Your projects and sessions sync across devices."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="text-ink underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <button
          type="button"
          onClick={() => socialSignin("github")}
          className="w-full h-10 border border-hairline rounded-sm flex items-center justify-center gap-2 text-sm hover:bg-surface-soft"
        >
          <GithubIcon className="h-4 w-4" /> Continue with GitHub
        </button>
        <button
          type="button"
          onClick={() => socialSignin("google")}
          className="w-full h-10 border border-hairline rounded-sm flex items-center justify-center gap-2 text-sm hover:bg-surface-soft"
        >
          <GoogleIcon className="h-4 w-4" /> Continue with Google
        </button>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-hairline" />
          <span className="text-[11px] uppercase tracking-widest text-mute">or</span>
          <div className="flex-1 h-px bg-hairline" />
        </div>

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
          className="w-full h-10 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"} <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </AuthShell>
  )
}
