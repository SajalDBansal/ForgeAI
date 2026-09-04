"use client"

import { toast } from "sonner"

import { GithubIcon } from "@/components/brand/github-icon"
import { GoogleIcon } from "@/components/brand/google-icon"
import { authClient } from "@/lib/auth-client"

// Starts GitHub or Google sign-in (which also signs up new users), returning to the home page.
// Shows a toast if the provider can't be reached.
async function continueWithProvider(provider: "github" | "google") {
  const { error } = await authClient.signIn.social({
    provider,
    callbackURL: `${window.location.origin}/`,
  })
  if (error) toast.error(error.message ?? `Couldn't continue with ${provider}.`)
}

// GitHub and Google sign-in buttons followed by an "or" divider.
// `verb` is the button prefix, e.g. "Continue with" or "Sign up with".
export function SocialAuthButtons({ verb }: { verb: string }) {
  return (
    <>
      <button
        type="button"
        onClick={() => continueWithProvider("github")}
        className="border-hairline hover:bg-surface-soft flex h-10 w-full items-center justify-center gap-2 rounded-sm border text-sm"
      >
        <GithubIcon className="h-4 w-4" /> {verb} GitHub
      </button>
      <button
        type="button"
        onClick={() => continueWithProvider("google")}
        className="border-hairline hover:bg-surface-soft flex h-10 w-full items-center justify-center gap-2 rounded-sm border text-sm"
      >
        <GoogleIcon className="h-4 w-4" /> {verb} Google
      </button>

      <div className="my-5 flex items-center gap-3">
        <div className="bg-hairline h-px flex-1" />
        <span className="text-mute text-[11px] tracking-widest uppercase">
          or
        </span>
        <div className="bg-hairline h-px flex-1" />
      </div>
    </>
  )
}
