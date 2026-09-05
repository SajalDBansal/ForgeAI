"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowRight, Check } from "lucide-react"
import { toast } from "sonner"

import { AuthShell, FormRow, inputCls } from "@/components/auth/auth-shell"
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons"
import { VerificationSent } from "@/components/auth/verification-sent"
import { authClient } from "@/lib/auth-client"

// Account sign-up form (name, email, password) plus social sign-up.
// Shows "check your email" once the account is created.
export function SignupForm() {
  const searchParams = useSearchParams()
  const [name, setName] = useState("")
  // Prefilled from an invite link so the invited address is the one signed up.
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "")
  const [pw, setPw] = useState("")
  const [accept, setAccept] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  // Creates the account and asks the user to verify their email.
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await authClient.signUp.email({
      name,
      email,
      password: pw,
    })
    setLoading(false)
    if (error) {
      toast.error(
        error.message ??
          "Couldn't create your workspace. Try a different email.",
      )
      return
    }
    setSentTo(email)
  }

  if (sentTo) return <VerificationSent email={sentTo} />

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Spin up a new ForgeAI workspace in seconds."
      footer={
        <>
          Already have an account?{" "}
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
        <SocialAuthButtons verb="Sign up with" />

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

        <label className="text-body flex items-start gap-2 text-xs">
          <button
            type="button"
            onClick={() => setAccept(!accept)}
            className={`border-hairline-strong mt-0.5 flex h-4 w-4 items-center justify-center rounded-sm border ${accept ? "bg-ink text-on-primary" : ""}`}
          >
            {accept && <Check className="h-3 w-3" />}
          </button>

          <span>
            I agree to the{" "}
            <Link
              href="/terms"
              className="text-ink underline underline-offset-4"
            >
              terms
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="text-ink underline underline-offset-4"
            >
              privacy policy
            </Link>
            .
          </span>
        </label>

        <button
          type="submit"
          disabled={!accept || loading}
          className="bg-ink text-on-primary hover:bg-ink-deep inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create workspace"}{" "}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </AuthShell>
  )
}
