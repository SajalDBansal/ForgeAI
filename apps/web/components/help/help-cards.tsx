import type { ReactNode } from "react"
import { BookOpen, MessageCircle, Zap } from "lucide-react"

import { PageCard } from "@/components/layout/page-card"

function Card({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <PageCard className="p-4 hover:border-hairline-strong transition-colors cursor-pointer">
      <div className="flex items-center gap-2 text-ink">
        {icon}
        <span className="font-bold text-sm">{title}</span>
      </div>
      <p className="mt-1 text-xs text-body">{desc}</p>
    </PageCard>
  )
}

export function HelpCards() {
  return (
    <div className="grid sm:grid-cols-3 gap-3">
      <Card icon={<BookOpen className="h-4 w-4" />} title="Docs" desc="Concepts, recipes, API." />
      <Card icon={<MessageCircle className="h-4 w-4" />} title="Community" desc="Forum + Discord." />
      <Card icon={<Zap className="h-4 w-4" />} title="Changelog" desc="What shipped this week." />
    </div>
  )
}
