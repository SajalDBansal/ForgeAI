"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"
import { toast } from "sonner"

import { AuthShell, FormRow, inputCls } from "@/components/auth/auth-shell"
import { VerificationSent } from "@/components/auth/verification-sent"
import { GithubIcon } from "@/components/brand/github-icon"
import { GoogleIcon } from "@/components/brand/google-icon"
import { authClient } from "@/lib/auth-client"

export function SignupForm() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [pw, setPw] = useState("")
  const [accept, setAccept] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await authClient.signUp.email({ name, email, password: pw })
    setLoading(false)
    if (error) {
      toast.error(error.message ?? "Couldn't create your workspace. Try a different email.")
      return
    }
    setSentTo(email)
  }

  const socialSignup = async (provider: "github" | "google") => {
    const { error } = await authClient.signIn.social({ provider, callbackURL: "/" })
    if (error) toast.error(error.message ?? `Couldn't continue with ${provider}.`)
  }

  if (sentTo) return <VerificationSent email={sentTo} />

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Spin up a new ForgeAI workspace in seconds."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/signin" className="text-ink underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <button
          type="button"
          onClick={() => socialSignup("github")}
          className="w-full h-10 border border-hairline rounded-sm flex items-center justify-center gap-2 text-sm hover:bg-surface-soft"
        >
          <GithubIcon className="h-4 w-4" /> Sign up with GitHub
        </button>
        <button
          type="button"
          onClick={() => socialSignup("google")}
          className="w-full h-10 border border-hairline rounded-sm flex items-center justify-center gap-2 text-sm hover:bg-surface-soft"
        >
          <GoogleIcon className="h-4 w-4" /> Sign up with Google
        </button>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-hairline" />
          <span className="text-[11px] uppercase tracking-widest text-mute">or</span>
          <div className="flex-1 h-px bg-hairline" />
        </div>

        <FormRow label="Full name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            required
            placeholder="Ada Lovelace"
          />
        </FormRow>
        <FormRow label="Work email">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            className={inputCls}
            required
            placeholder="you@studio.dev"
          />
        </FormRow>
        <FormRow label="Password" hint="8+ characters">
          <input
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            type="password"
            className={inputCls}
            required
            minLength={8}
            placeholder="••••••••"
          />
        </FormRow>

        <label className="flex items-start gap-2 text-xs text-body">
          <button
            type="button"
            onClick={() => setAccept(!accept)}
            className={`mt-0.5 h-4 w-4 border border-hairline-strong rounded-sm flex items-center justify-center ${accept ? "bg-ink text-on-primary" : ""}`}>
            {accept && <Check className="h-3 w-3" />}
          </button>

          <span>
            I agree to the{" "}
            <Link href="/terms" className="text-ink underline underline-offset-4">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-ink underline underline-offset-4">
              privacy policy
            </Link>
            .
          </span>
        </label>

        <button
          type="submit"
          disabled={!accept || loading}
          className="w-full h-10 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create workspace"} <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </AuthShell>
  )
}
