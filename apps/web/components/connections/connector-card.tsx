"use client"

import type { ReactNode } from "react"
import { useRouter } from "next/navigation"

import { Skeleton } from "@forgeAI/ui/components/skeleton"

import { PageCard } from "@/components/layout/page-card"

export function ConnectorCardSkeleton() {
  return (
    <PageCard className="p-5">
      <div className="flex items-start gap-4">
        <Skeleton className="h-12 w-12 rounded-sm bg-surface-card shrink-0" />
        <div className="flex-1 min-w-0 space-y-2 py-0.5">
          <Skeleton className="h-4 w-24 rounded-sm bg-surface-card" />
          <Skeleton className="h-3 w-56 rounded-sm bg-surface-card" />
        </div>
        <Skeleton className="h-8 w-20 rounded-sm bg-surface-card shrink-0" />
      </div>
    </PageCard>
  )
}

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
    <PageCard className="p-5 hover:border-hairline-strong cursor-pointer">
      <div onClick={() => router.push(`/connections/${slug}`)} className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-sm bg-ink text-on-primary flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-bold">{name}</h2>
            <span
              className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm ${connected ? "bg-success/15 text-success" : "bg-surface-card text-mute"
                }`}
            >
              {status}
            </span>
          </div>
          <p className="mt-1 text-sm text-body">{description}</p>
        </div>
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          {action}
        </div>
      </div>
    </PageCard>
  )
}
