import type { Metadata } from "next"
import Link from "next/link"

import { PageShell } from "@/components/layout/page-shell"
import { HelpCards } from "@/components/help/help-cards"
import { FaqSearch } from "@/components/help/faq-search"
import { ShortcutsTable } from "@/components/help/shortcuts-table"

export const metadata: Metadata = { title: "Help — ForgeAI" }

export default function HelpPage() {
  return (
    <PageShell breadcrumbs={[{ label: "help" }]}>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <HelpCards />
        <FaqSearch />
        <ShortcutsTable />
        <div className="text-xs text-mute">
          Can&apos;t find an answer?{" "}
          <Link href="/help" className="text-ink underline underline-offset-4">
            Open a ticket
          </Link>
          .
        </div>
      </div>
    </PageShell>
  )
}
