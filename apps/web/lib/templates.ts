import { cache } from "react"
import { headers } from "next/headers"

import type { TemplateDetail } from "@/lib/types"
import { PUBLIC_ENV } from "@/lib/env"

export type TemplateDetailResult =
  | { status: "ok"; template: TemplateDetail }
  | { status: "unauthenticated" }
  | { status: "not-found" }

// Loads one template's details on the server, forwarding the cookie (cached per request).
// Distinguishes signed-out from not-found so the page can redirect correctly.
export const getTemplateDetail = cache(
  async (id: string): Promise<TemplateDetailResult> => {
    const cookie = (await headers()).get("cookie")
    if (!cookie) return { status: "unauthenticated" }

    try {
      const res = await fetch(
        `${PUBLIC_ENV.AUTH_URL}/api/v1/template/${encodeURIComponent(id)}`,
        { headers: { cookie }, cache: "no-store" },
      )
      if (res.status === 401) return { status: "unauthenticated" }
      if (!res.ok) return { status: "not-found" }
      return { status: "ok", template: (await res.json()) as TemplateDetail }
    } catch {
      return { status: "not-found" }
    }
  },
)
