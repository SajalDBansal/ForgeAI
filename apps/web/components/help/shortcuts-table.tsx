import { Keyboard } from "lucide-react"

import { PageCard } from "@/components/layout/page-card"

const SHORTCUTS = [
  { k: "⌘ K", v: "Open command bar" },
  { k: "⌘ Enter", v: "Send message to agent" },
  { k: "⌘ /", v: "Toggle plan ↔ build mode" },
  { k: "⌘ ⇧ E", v: "Open file in editor" },
  { k: "⌘ ⇧ P", v: "Run preview" },
  { k: "⌘ B", v: "Toggle sidebar" },
]

// Table of the app's keyboard shortcuts.
// Shown on the Help page.
export function ShortcutsTable() {
  return (
    <PageCard className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Keyboard className="h-4 w-4" />
        <h2 className="text-sm font-bold">Keyboard shortcuts</h2>
      </div>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {SHORTCUTS.map((s) => (
          <div
            key={s.k}
            className="hairline-b flex items-center justify-between py-1.5 text-sm last:border-0"
          >
            <span className="text-body">{s.v}</span>
            <kbd className="border-hairline bg-surface-soft rounded-sm border px-1.5 py-0.5 font-mono text-[11px]">
              {s.k}
            </kbd>
          </div>
        ))}
      </div>
    </PageCard>
  )
}
