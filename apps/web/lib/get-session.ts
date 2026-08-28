import { headers } from "next/headers"

export interface ServerSession {
  session: { id: string; userId: string; expiresAt: string;[key: string]: unknown }
  user: { id: string; name: string; email: string;[key: string]: unknown }
}

export async function getServerSession(): Promise<ServerSession | null> {
  const cookie = (await headers()).get("cookie")
  if (!cookie) return null

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_AUTH_URL}/api/v1/auth/get-session`, {
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
