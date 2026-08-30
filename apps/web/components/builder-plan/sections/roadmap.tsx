import { ChevronRight } from "lucide-react"

import { SectionTitle } from "@/components/builder-plan/sections/section-title"

const PHASES: { p: string; w: string; items: string[] }[] = []

export function Roadmap() {
  return (
    <div className="space-y-5">
      <SectionTitle label="mini roadmap" hint="Each phase ends with a deployable artifact. Re-plan after Phase 2." />
      {PHASES.length === 0 && <p className="text-[12px] text-mute">No phases planned yet.</p>}
      <div className="relative pl-5">
        <div className="absolute left-1.5 top-1 bottom-1 w-px bg-hairline" />
        {PHASES.map((ph) => (
          <div key={ph.p} className="relative pb-5 last:pb-0">
            <div className="absolute -left-[14px] top-1.5 h-2.5 w-2.5 border border-ink bg-canvas" />
            <div className="flex items-baseline gap-3">
              <div className="text-sm font-bold">{ph.p}</div>
              <div className="text-[11px] uppercase tracking-widest text-mute">{ph.w}</div>
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {ph.items.map((it) => (
                <li key={it} className="flex gap-2 text-sm text-body">
                  <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-mute shrink-0" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
