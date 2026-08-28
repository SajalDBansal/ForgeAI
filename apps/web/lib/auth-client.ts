import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL,
  // Must match apps/api-fast's basePath (lib/auth.ts) — auth now lives under /api/v1.
  basePath: "/api/v1/auth",
})
