"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Search } from "lucide-react"

import { TopBar } from "@/components/layout/topbar"
import { PageCard } from "@/components/layout/page-card"
import { useAppStore } from "@/lib/store"

function tagsFrom(templates: { tag: string }[]): string[] {
  return ["All", ...Array.from(new Set(templates.map((t) => t.tag))).sort()]
}

export function TemplatesView() {
  const [q, setQ] = useState("")
  const [tag, setTag] = useState("All")
  const templates = useAppStore((s) => s.templates)
  const TAGS = tagsFrom(templates)
  const list = templates.filter(
    (t) =>
      (tag === "All" || t.tag === tag) &&
      (!q || t.name.includes(q.toLowerCase()) || t.description.toLowerCase().includes(q.toLowerCase()))
  )

  return (
    <>
      <TopBar
        breadcrumbs={[{ label: "templates" }]}
        actions={
          <div className="relative w-72">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search templates…"
              className="w-full h-9 bg-surface-soft pl-8 pr-3 text-sm rounded-sm border border-hairline focus:outline-none focus:border-ink"
            />
          </div>
        }
      />
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="p-6 space-y-5">
          <p className="text-sm text-body max-w-2xl">
            Start from a vetted scaffold. Templates are starting points — the agent
            reshapes them to match your prompt.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((t) => (
              <button
                key={t}
                onClick={() => setTag(t)}
                className={`h-7 px-3 text-xs rounded-sm border ${tag === t ? "bg-ink text-on-primary border-ink" : "border-hairline hover:bg-surface-soft"
                  }`}
              >
                {t}
              </button>
            ))}
          </div>

          {list.length === 0 && (
            <p className="py-12 text-center border border-hairline rounded-sm bg-canvas text-sm text-body">
              No templates available yet.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((t) => (
              <PageCard key={t.id} className="p-4 group hover:border-hairline-strong transition-colors">
                <div className="aspect-16/9 bg-canvas border border-hairline rounded-sm mb-3 flex items-center justify-center font-mono text-[10px] text-mute">
                  <pre className="select-none">{`┌──────────────┐
│ ░░░░░  ▓▓▓░░ │
│ ░░░░   ▓▓░░░ │
│ ░░░    ░░░░░ │
└──────────────┘`}</pre>
                </div>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-bold text-sm">{t.name}</h3>
                  <span className="text-[10px] uppercase tracking-widest text-mute">{t.tag}</span>
                </div>
                <p className="mt-1 text-xs text-body line-clamp-2">{t.description}</p>
                <Link
                  href={`/templates/${t.id}`}
                  className="mt-3 h-8 w-full text-xs rounded-sm bg-ink text-on-primary hover:bg-ink-deep inline-flex items-center justify-center gap-1.5"
                >
                  Show template <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </PageCard>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
