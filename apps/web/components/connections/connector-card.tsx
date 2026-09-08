"use client"

import type { ReactNode } from "react"
import { useRouter } from "next/navigation"

import { Skeleton } from "@forgeAI/ui/components/skeleton"

import { PageCard } from "@/components/layout/page-card"

// Placeholder card shown while connections load.
// Matches ConnectorCard's layout.
export function ConnectorCardSkeleton() {
  return (
    <PageCard className="p-5">
      <div className="flex items-start gap-4">
        <Skeleton className="bg-surface-card h-12 w-12 shrink-0 rounded-sm" />
        <div className="min-w-0 flex-1 space-y-2 py-0.5">
          <Skeleton className="bg-surface-card h-4 w-24 rounded-sm" />
          <Skeleton className="bg-surface-card h-3 w-56 rounded-sm" />
        </div>
        <Skeleton className="bg-surface-card h-8 w-20 shrink-0 rounded-sm" />
      </div>
    </PageCard>
  )
}

// One provider card with icon, status badge and an action button.
// Clicking the card opens the provider's detail page.
export function ConnectorCard({
  slug,
  icon,
  name,
  description,
  status,
  connected,
  action,
}: {
  slug: string
  icon: ReactNode
  name: string
  description: string
  status: string
  connected: boolean
  action: ReactNode
}) {
  const router = useRouter()

  return (
    <PageCard className="hover:border-hairline-strong cursor-pointer p-5">
      <div
        onClick={() => router.push(`/connections/${slug}`)}
        className="flex items-start gap-4"
      >
        <div className="bg-ink text-on-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-sm">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-bold">{name}</h2>
            <span
              className={`rounded-sm px-1.5 py-0.5 text-[10px] tracking-widest uppercase ${
                connected
                  ? "bg-success/15 text-success"
                  : "bg-surface-card text-mute"
              }`}
            >
              {status}
            </span>
          </div>
          <p className="text-body mt-1 text-sm">{description}</p>
        </div>
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          {action}
        </div>
      </div>
    </PageCard>
  )
}
