import { createAuthClient } from "better-auth/react"
import { PUBLIC_ENV } from "@/lib/env"

// better-auth client pointed at the API's auth routes.
// Used by the sign-in, sign-up and session hooks.
export const authClient = createAuthClient({
  baseURL: PUBLIC_ENV.AUTH_URL,
  basePath: "/api/v1/auth",
})
