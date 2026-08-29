"use client"

import { useState } from "react"
import { ChevronRight, Search } from "lucide-react"

import { PageCard } from "@/components/layout/page-card"
import { displayToast } from "@/lib/toast"


const FAQ = [
  { q: "How does the agent decide what to build?", a: "It reads your prompt, drafts a plan, asks clarifying questions when needed, then writes files in small, reviewable batches." },
  { q: "Can I run my own code?", a: "Yes. Open the Code tab, edit files inline, and the preview hot-reloads on save." },
  { q: "Is my project private?", a: "Projects default to private. Sharing requires you to explicitly invite a collaborator or generate a public link." },
  { q: "What happens when I export?", a: "Exporting downloads a zip of the working tree, or pushes to your linked GitHub repo." },
  { q: "Does the agent have a memory of past sessions?", a: "Within a project, yes — the agent keeps a rolling context of recent turns, files, and decisions." },
  { q: "How do I deploy?", a: "Hit Deploy in the workspace header. A preview URL is generated and you can promote it to production from the Deploy dialog." },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="px-2">
      <button onClick={() => setOpen(!open)} className="w-full text-left py-3 flex items-center gap-2">
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="text-sm font-medium flex-1">{q}</span>
      </button>
      {open && <p className="pl-6 pb-3 text-sm text-body">{a}</p>}
    </li>
  )
}

export function FaqSearch() {
  const [q, setQ] = useState("")
  const list = FAQ.filter((f) => !q || f.q.toLowerCase().includes(q.toLowerCase()))

  return (
    <PageCard className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the FAQ…"
            className="w-full h-9 bg-canvas pl-8 pr-3 text-sm rounded-sm border border-hairline focus:outline-none focus:border-ink"
          />
        </div>
        <button
          onClick={() => displayToast("Chat opened (demo)")}
          className="h-9 px-3 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep"
        >
          Talk to support
        </button>
      </div>

      <ul className="divide-y divide-hairline -mx-2">
        {list.map((f, i) => (
          <FaqItem key={i} q={f.q} a={f.a} />
        ))}
        {list.length === 0 && (
          <li className="px-2 py-6 text-sm text-mute text-center">No matches. Try different keywords.</li>
        )}
      </ul>
    </PageCard>
  )
}
