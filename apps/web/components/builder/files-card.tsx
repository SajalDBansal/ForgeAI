"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, FileText } from "lucide-react"

import type { Message } from "@/lib/types"

export function FilesCard({ m }: { m: Message }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border border-hairline rounded-sm">
      <button onClick={() => setOpen((o) => !o)} className="w-full px-3 py-2 flex items-center gap-2 text-left">
        {open ? <ChevronDown className="h-3.5 w-3.5 text-mute" /> : <ChevronRight className="h-3.5 w-3.5 text-mute" />}
        <FileText className="h-3.5 w-3.5 text-mute" />
        <span className="text-sm font-medium">{m.files?.length} file changes</span>
        <span className="ml-auto text-[11px] text-mute">
          +{m.files?.reduce((a, f) => a + (f.additions ?? 0), 0)} · −
          {m.files?.reduce((a, f) => a + (f.deletions ?? 0), 0)}
        </span>
      </button>
      {open && (
        <ul className="hairline-t divide-y divide-hairline">
          {m.files?.map((f) => (
            <li key={f.path} className="px-3 py-1.5 text-[12px] flex items-center gap-2 font-mono">
              <span className="w-3 text-mute">
                {f.action === "created" ? "+" : f.action === "deleted" ? "−" : "~"}
              </span>
              <span className="truncate">{f.path}</span>
              <span className="ml-auto text-mute tabular-nums">
                {f.additions ? <span className="text-success">+{f.additions}</span> : null}
                {f.deletions ? <span className="text-danger ml-1.5">−{f.deletions}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
