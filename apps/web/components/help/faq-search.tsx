"use client"

import { useState } from "react"
import { ChevronRight, Search } from "lucide-react"

import { PageCard } from "@/components/layout/page-card"
import { displayToast } from "@/lib/toast"

const FAQ = [
  {
    q: "How does the agent decide what to build?",
    a: "It reads your prompt, drafts a plan, asks clarifying questions when needed, then writes files in small, reviewable batches.",
  },
  {
    q: "Can I run my own code?",
    a: "Yes. Open the Code tab, edit files inline, and the preview hot-reloads on save.",
  },
  {
    q: "Is my project private?",
    a: "Projects default to private. Sharing requires you to explicitly invite a collaborator or generate a public link.",
  },
  {
    q: "What happens when I export?",
    a: "Exporting downloads a zip of the working tree, or pushes to your linked GitHub repo.",
  },
  {
    q: "Does the agent have a memory of past sessions?",
    a: "Within a project, yes — the agent keeps a rolling context of recent turns, files, and decisions.",
  },
  {
    q: "How do I deploy?",
    a: "Hit Deploy in the workspace header. A preview URL is generated and you can promote it to production from the Deploy dialog.",
  },
]

// One expandable FAQ question and answer.
// Toggles its answer open on click.
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="px-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 py-3 text-left"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="flex-1 text-sm font-medium">{q}</span>
      </button>
      {open && <p className="text-body pb-3 pl-6 text-sm">{a}</p>}
    </li>
  )
}

// Searchable FAQ list with a "talk to support" button.
// Filters questions as you type.
export function FaqSearch() {
  const [q, setQ] = useState("")
  const list = FAQ.filter(
    (f) => !q || f.q.toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <PageCard className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="text-mute absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the FAQ…"
            className="bg-canvas border-hairline focus:border-ink h-9 w-full rounded-sm border pr-3 pl-8 text-sm focus:outline-none"
          />
        </div>
        <button
          onClick={() => displayToast("Chat opened (demo)")}
          className="bg-ink text-on-primary hover:bg-ink-deep h-9 rounded-sm px-3 text-sm font-medium"
        >
          Talk to support
        </button>
      </div>

      <ul className="divide-hairline -mx-2 divide-y">
        {list.map((f, i) => (
          <FaqItem key={i} q={f.q} a={f.a} />
        ))}
        {list.length === 0 && (
          <li className="text-mute px-2 py-6 text-center text-sm">
            No matches. Try different keywords.
          </li>
        )}
      </ul>
    </PageCard>
  )
}
