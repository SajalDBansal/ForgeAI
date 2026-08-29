"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { GithubIcon } from "@/components/brand/github-icon"
import { VercelIcon } from "@/components/brand/vercel-icon"
import { RenderIcon } from "@/components/brand/render-icon"
import { SupabaseIcon } from "@/components/brand/supabase-icon"
import { ConnectorCard, ConnectorCardSkeleton } from "@/components/connections/connector-card"
import { RenderConnectDialog } from "@/components/connections/render-connect-dialog"
import { useConnections, type Connection } from "@/hooks/use-connections"
import { displayToast } from "@/lib/toast"

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL

const actionCls = {
  connect: "h-8 px-3 rounded-sm text-xs font-medium bg-ink text-on-primary hover:bg-ink-deep inline-flex items-center",
  disconnect: "h-8 px-3 rounded-sm text-xs font-medium border border-hairline hover:bg-surface-soft",
}

type ConnectorSlug = "github" | "vercel" | "supabase" | "render"

const CONNECTORS: {
  slug: ConnectorSlug
  provider: Connection["provider"]
  icon: ReactNode
  name: string
  description: string
  startPath?: string
}[] = [
  { slug: "github", provider: "GITHUB", icon: <GithubIcon className="h-6 w-6" />, name: "GitHub", description: "Sync ForgeAI projects to GitHub repositories.", startPath: "github/start" },
  { slug: "vercel", provider: "VERCEL", icon: <VercelIcon className="h-6 w-6" />, name: "Vercel", description: "Deploy ForgeAI projects to Vercel edge network.", startPath: "vercel/start" },
  { slug: "supabase", provider: "SUPABASE", icon: <SupabaseIcon className="h-6 w-6" />, name: "Supabase", description: "Provision Postgres, auth, and storage for ForgeAI projects.", startPath: "supabase/start" },
  { slug: "render", provider: "RENDER", icon: <RenderIcon className="h-6 w-6" />, name: "Render", description: "Host ForgeAI backends and static sites on Render." },
]

export function ConnectionsView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { connections, loading, refresh } = useConnections()
  const [renderDialogOpen, setRenderDialogOpen] = useState(false)

  useEffect(() => {
    const result = searchParams.get("connected")
    const error = searchParams.get("error")
    const label = CONNECTORS.find((c) => c.slug === result)?.name
    if (label) displayToast(`Connected to ${label}`)
    if (error) displayToast(`Connection failed (${error.replace(/_/g, " ")})`)
    if (result || error) {
      void refresh()
      router.replace("/connections")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const disconnect = async (slug: ConnectorSlug, name: string) => {
    const res = await fetch(`${AUTH_URL}/api/v1/connections/${slug}`, { method: "DELETE", credentials: "include" })
    if (res.ok) {
      displayToast(`Disconnected ${name}`)
      void refresh()
    } else {
      displayToast(`Couldn't disconnect ${name}`)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-3">
      {loading
        ? CONNECTORS.map((c) => <ConnectorCardSkeleton key={c.slug} />)
        : CONNECTORS.map((c) => {
            const connection = connections.find((x) => x.provider === c.provider && x.status === "CONNECTED")
            return (
              <ConnectorCard
                key={c.slug}
                slug={c.slug}
                icon={c.icon}
                name={c.name}
                description={c.description}
                status={connection ? `Connected as ${connection.externalAccountLogin}` : "Not connected"}
                connected={Boolean(connection)}
                action={
                  connection ? (
                    <button onClick={() => disconnect(c.slug, c.name)} className={actionCls.disconnect}>
                      Disconnect
                    </button>
                  ) : c.startPath ? (
                    <a href={`${AUTH_URL}/api/v1/connections/${c.startPath}`} className={actionCls.connect}>
                      Connect
                    </a>
                  ) : (
                    <button onClick={() => setRenderDialogOpen(true)} className={actionCls.connect}>
                      Connect
                    </button>
                  )
                }
              />
            )
          })}

      {renderDialogOpen && (
        <RenderConnectDialog
          onClose={() => setRenderDialogOpen(false)}
          onConnected={() => void refresh()}
        />
      )}
    </div>
  )
}
