import type { Metadata } from "next"

import { SigninForm } from "@/components/auth/signin-form"

export const metadata: Metadata = { title: "Sign in — ForgeAI" }

export default function SigninPage() {
  return <SigninForm />
}
