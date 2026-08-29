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

export function ShortcutsTable() {
  return (
    <PageCard className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Keyboard className="h-4 w-4" />
        <h2 className="text-sm font-bold">Keyboard shortcuts</h2>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
        {SHORTCUTS.map((s) => (
          <div
            key={s.k}
            className="flex items-center justify-between text-sm py-1.5 hairline-b last:border-0"
          >
            <span className="text-body">{s.v}</span>
            <kbd className="text-[11px] font-mono px-1.5 py-0.5 border border-hairline rounded-sm bg-surface-soft">
              {s.k}
            </kbd>
          </div>
        ))}
      </div>
    </PageCard>
  )
}
