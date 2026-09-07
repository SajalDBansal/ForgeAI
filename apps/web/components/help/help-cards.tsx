import type { ReactNode } from "react"
import { BookOpen, MessageCircle, Zap } from "lucide-react"

import { PageCard } from "@/components/layout/page-card"

// One help resource card with an icon, title and description.
// Used by HelpCards.
function Card({
  icon,
  title,
  desc,
}: {
  icon: ReactNode
  title: string
  desc: string
}) {
  return (
    <PageCard className="hover:border-hairline-strong cursor-pointer p-4 transition-colors">
      <div className="text-ink flex items-center gap-2">
        {icon}
        <span className="text-sm font-bold">{title}</span>
      </div>
      <p className="text-body mt-1 text-xs">{desc}</p>
    </PageCard>
  )
}

// Row of links to docs, community and changelog.
// Shown at the top of the Help page.
export function HelpCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card
        icon={<BookOpen className="h-4 w-4" />}
        title="Docs"
        desc="Concepts, recipes, API."
      />
      <Card
        icon={<MessageCircle className="h-4 w-4" />}
        title="Community"
        desc="Forum + Discord."
      />
      <Card
        icon={<Zap className="h-4 w-4" />}
        title="Changelog"
        desc="What shipped this week."
      />
    </div>
  )
}
