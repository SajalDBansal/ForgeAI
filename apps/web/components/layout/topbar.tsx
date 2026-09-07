"use client"

import type { ReactNode } from "react"
import Link from "next/link"

import { WordmarkSmall } from "@/components/brand/wordmark"
import { ThemeToggle } from "@/components/brand/theme-toggle"

export interface Breadcrumb {
  label: string
  href?: string
}

// Top bar with breadcrumbs, page actions, theme toggle and status pill.
// Rendered by PageShell.
export function TopBar({
  breadcrumbs,
  actions,
}: {
  breadcrumbs: Breadcrumb[]
  actions?: ReactNode
}) {
  return (
    <div className="hairline-b flex items-center justify-between gap-4 px-5 py-3 md:px-10">
      <nav className="text-mute flex min-w-0 flex-1 items-center gap-3 text-sm">
        <Link href="/" className="hover:text-ink md:hidden">
          <WordmarkSmall />
        </Link>
        <Link href="/" className="hover:text-ink hidden md:inline">
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
                <span className={isLast ? "text-ink" : undefined}>
                  {crumb.label}
                </span>
              )}
            </span>
          )
        })}
      </nav>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <ThemeToggle />
        <span className="bg-surface-card text-mute hidden h-8 items-center gap-2 rounded-sm px-3 text-sm sm:flex">
          <span className="bg-success h-1.5 w-1.5 rounded-full" /> All systems
          normal
        </span>
      </div>
    </div>
  )
}
