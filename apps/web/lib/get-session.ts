import { headers } from "next/headers"
import { PUBLIC_ENV } from "@/lib/env"

export interface ServerSession {
  session: {
    id: string
    userId: string
    expiresAt: string
    [key: string]: unknown
  }
  user: { id: string; name: string; email: string; [key: string]: unknown }
}

// Reads the session on the server by forwarding the request's cookie to the API.
// Used by server components and layouts to gate signed-in pages.
export async function getServerSession(): Promise<ServerSession | null> {
  const cookie = (await headers()).get("cookie")
  if (!cookie) return null

  try {
    const res = await fetch(`${PUBLIC_ENV.AUTH_URL}/api/v1/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as ServerSession | null
    return data
  } catch {
    return null
  }
}
