"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { Button } from "@forgeAI/ui/components/button"

import { useAppStore } from "@/lib/store"

export function TemplatesGrid() {
  const templates = useAppStore((s) => s.templates)

  return (
    <section className="mt-16">
      <div className="flex items-end justify-between hairline-b pb-2">
        <h2 className="text-base font-bold">Templates</h2>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-auto p-0 text-xs text-mute hover:text-ink hover:bg-transparent gap-1"
        >
          <Link href="/templates">
            View all <ChevronRight className="h-3 w-3" />
          </Link>
        </Button>
      </div>
      {templates.length === 0 && (
        <p className="mt-4 py-8 text-center border border-hairline rounded-sm bg-canvas text-sm text-body">
          No templates available yet.
        </p>
      )}
      <ul className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {templates.map((t) => (
          <li key={t.id} className="h-full">
            <Link
              href={`/templates/${t.id}`}
              className="w-full text-left p-4 border border-hairline rounded-sm hover:border-ink h-full flex flex-col"
            >
              <div className="text-[10px] text-mute uppercase tracking-widest">{t.tag}</div>
              <div className="mt-2 font-medium">{t.name}</div>
              <div className="mt-1.5 text-xs text-body flex-1">{t.description}</div>
              <div className="mt-3 text-[11px] text-mute">[+] show template →</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
