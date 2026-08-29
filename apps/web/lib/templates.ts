import { cache } from "react"
import { headers } from "next/headers"

import type { TemplateDetail } from "@/lib/types"

export type TemplateDetailResult =
  | { status: "ok"; template: TemplateDetail }
  | { status: "unauthenticated" }
  | { status: "not-found" }

export const getTemplateDetail = cache(async (id: string): Promise<TemplateDetailResult> => {
  const cookie = (await headers()).get("cookie")
  if (!cookie) return { status: "unauthenticated" }

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_AUTH_URL}/api/v1/template/${encodeURIComponent(id)}`,
      { headers: { cookie }, cache: "no-store" },
    )
    if (res.status === 401) return { status: "unauthenticated" }
    if (!res.ok) return { status: "not-found" }
    return { status: "ok", template: (await res.json()) as TemplateDetail }
  } catch {
    return { status: "not-found" }
  }
})
