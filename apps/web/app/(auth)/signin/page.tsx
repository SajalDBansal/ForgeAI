import type { Metadata } from "next"
import { Suspense } from "react"

import { SigninForm } from "@/components/auth/signin-form"

export const metadata: Metadata = { title: "Sign in — ForgeAI" }

// Sign-in page.
// Where signed-out users are redirected.
export default function SigninPage() {
  return (
    <Suspense>
      <SigninForm />
    </Suspense>
  )
}
