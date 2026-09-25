"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Search } from "lucide-react"

import { TopBar } from "@/components/layout/topbar"
import { PageCard } from "@/components/layout/page-card"
import { useAppStore } from "@/lib/store"

// Returns "All" plus each distinct template tag, sorted.
// Builds the tag filter buttons.
function tagsFrom(templates: { tag: string }[]): string[] {
  return ["All", ...Array.from(new Set(templates.map((t) => t.tag))).sort()]
}

// Templates gallery with search and tag filters.
// Each card links to the template's detail page.
export function TemplatesView() {
  const [q, setQ] = useState("")
  const [tag, setTag] = useState("All")
  const templates = useAppStore((s) => s.templates)
  const TAGS = tagsFrom(templates)
  const list = templates.filter(
    (t) =>
      (tag === "All" || t.tag === tag) &&
      (!q ||
        t.name.includes(q.toLowerCase()) ||
        t.description.toLowerCase().includes(q.toLowerCase())),
  )

  return (
    <>
      <TopBar
        breadcrumbs={[{ label: "templates" }]}
        actions={
          <div className="relative w-72">
            <Search className="text-mute absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search templates…"
              className="bg-surface-soft border-hairline focus:border-ink h-9 w-full rounded-sm border pr-3 pl-8 text-sm focus:outline-none"
            />
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="space-y-5 p-6">
          <p className="text-body max-w-2xl text-sm">
            Start from a vetted scaffold. Templates are starting points — the
            agent reshapes them to match your prompt.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((t) => (
              <button
                key={t}
                onClick={() => setTag(t)}
                className={`h-7 rounded-sm border px-3 text-xs ${
                  tag === t
                    ? "bg-ink text-on-primary border-ink"
                    : "border-hairline hover:bg-surface-soft"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {list.length === 0 && (
            <p className="border-hairline bg-canvas text-body rounded-sm border py-12 text-center text-sm">
              No templates available yet.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((t) => (
              <PageCard
                key={t.id}
                className="group hover:border-hairline-strong p-4 transition-colors"
              >
                <div className="bg-canvas border-hairline text-mute mb-3 flex aspect-16/9 items-center justify-center rounded-sm border font-mono text-[10px]">
                  <pre className="select-none">{`┌──────────────┐
│ ░░░░░  ▓▓▓░░ │
│ ░░░░   ▓▓░░░ │
│ ░░░    ░░░░░ │
└──────────────┘`}</pre>
                </div>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-bold">{t.name}</h3>
                  <span className="text-mute text-[10px] tracking-widest uppercase">
                    {t.tag}
                  </span>
                </div>
                <p className="text-body mt-1 line-clamp-2 text-xs">
                  {t.description}
                </p>
                <Link
                  href={`/templates/${t.id}`}
                  className="bg-ink text-on-primary hover:bg-ink-deep mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-sm text-xs"
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
