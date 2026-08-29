import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PageShell } from "@/components/layout/page-shell"
import { GithubView } from "@/components/connections/github-view"
import { VercelView } from "@/components/connections/vercel-view"
import { RenderView } from "@/components/connections/render-view"
import { SupabaseView } from "@/components/connections/supabase-view"

const CONNECTORS = {
  github: { label: "GitHub", View: GithubView },
  vercel: { label: "Vercel", View: VercelView },
  render: { label: "Render", View: RenderView },
  supabase: { label: "Supabase", View: SupabaseView },
} as const

type ConnectorSlug = keyof typeof CONNECTORS

export async function generateMetadata({
  params,
}: {
  params: Promise<{ provider: string }>
}): Promise<Metadata> {
  const { provider } = await params
  const connector = CONNECTORS[provider as ConnectorSlug]
  return { title: connector ? `${connector.label} — ForgeAI` : "Connections — ForgeAI" }
}

export default async function ConnectionProviderPage({
  params,
}: {
  params: Promise<{ provider: string }>
}) {
  const { provider } = await params
  const connector = CONNECTORS[provider as ConnectorSlug]
  if (!connector) notFound()

  const { label, View } = connector
  return (
    <PageShell breadcrumbs={[{ label: "connections", href: "/connections" }, { label: label.toLowerCase() }]}>
      <div className="pt-6">
        <View />
      </div>
    </PageShell>
  )
}
