"use client"

import type { ReactNode } from "react"
import Link from "next/link"

import { WordmarkSmall } from "@/components/brand/wordmark"
import { ThemeToggle } from "@/components/brand/theme-toggle"

export interface Breadcrumb {
  label: string
  href?: string
}

export function TopBar({
  breadcrumbs,
  actions,
}: {
  breadcrumbs: Breadcrumb[]
  actions?: ReactNode
}) {

  return (
    <div className="hairline-b px-5 md:px-10 py-3 flex items-center justify-between gap-4">
      <nav className="min-w-0 flex-1 flex items-center gap-3 text-sm text-mute">
        <Link href="/" className="md:hidden hover:text-ink">
          <WordmarkSmall />
        </Link>
        <Link href="/" className="hidden md:inline hover:text-ink">
          [ workspace ]
        </Link>
        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1
          return (
            <span key={i} className="flex items-center gap-3">
              <span className="text-stone">/</span>
              {!isLast && crumb.href ? (
                <Link href={crumb.href} className="hover:text-ink">
                  {crumb.label}
                </Link>
              ) : (
                <span className={isLast ? "text-ink" : undefined}>{crumb.label}</span>
              )}
            </span>
          )
        })}
      </nav>
      <div className="flex items-center gap-2 shrink-0">
        {actions}
        <ThemeToggle />
        <span className="h-8 px-3 text-sm bg-surface-card text-mute rounded-sm hidden sm:flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> All systems normal
        </span>
      </div>
    </div>
  )
}
