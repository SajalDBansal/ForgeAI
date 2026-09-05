import type { Metadata } from "next"
import { Suspense } from "react"

import { SignupForm } from "@/components/auth/signup-form"

export const metadata: Metadata = { title: "Create account — ForgeAI" }

// Sign-up page.
// Creates a new account.
export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  )
}
