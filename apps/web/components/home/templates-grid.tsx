"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { Button } from "@forgeAI/ui/components/button"

import { useAppStore } from "@/lib/store"

// Home page section listing available templates.
// Each card links to the template's detail page.
export function TemplatesGrid() {
  const templates = useAppStore((s) => s.templates)

  return (
    <section className="mt-16">
      <div className="hairline-b flex items-end justify-between pb-2">
        <h2 className="text-base font-bold">Templates</h2>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-mute hover:text-ink h-auto gap-1 p-0 text-xs hover:bg-transparent"
        >
          <Link href="/templates">
            View all <ChevronRight className="h-3 w-3" />
          </Link>
        </Button>
      </div>
      {templates.length === 0 && (
        <p className="border-hairline bg-canvas text-body mt-4 rounded-sm border py-8 text-center text-sm">
          No templates available yet.
        </p>
      )}
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <li key={t.id} className="h-full">
            <Link
              href={`/templates/${t.id}`}
              className="border-hairline hover:border-ink flex h-full w-full flex-col rounded-sm border p-4 text-left"
            >
              <div className="text-mute text-[10px] tracking-widest uppercase">
                {t.tag}
              </div>
              <div className="mt-2 font-medium">{t.name}</div>
              <div className="text-body mt-1.5 flex-1 text-xs">
                {t.description}
              </div>
              <div className="text-mute mt-3 text-[11px]">
                [+] show template →
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
