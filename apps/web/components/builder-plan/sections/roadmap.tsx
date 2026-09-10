import { ChevronRight } from "lucide-react"

import { SectionTitle } from "@/components/builder-plan/sections/section-title"

const PHASES: { p: string; w: string; items: string[] }[] = []

// Plan section showing roadmap phases.
// Placeholder content until the agent fills it in.
export function Roadmap() {
  return (
    <div className="space-y-5">
      <SectionTitle
        label="mini roadmap"
        hint="Each phase ends with a deployable artifact. Re-plan after Phase 2."
      />
      {PHASES.length === 0 && (
        <p className="text-mute text-[12px]">No phases planned yet.</p>
      )}
      <div className="relative pl-5">
        <div className="bg-hairline absolute top-1 bottom-1 left-1.5 w-px" />
        {PHASES.map((ph) => (
          <div key={ph.p} className="relative pb-5 last:pb-0">
            <div className="border-ink bg-canvas absolute top-1.5 -left-[14px] h-2.5 w-2.5 border" />
            <div className="flex items-baseline gap-3">
              <div className="text-sm font-bold">{ph.p}</div>
              <div className="text-mute text-[11px] tracking-widest uppercase">
                {ph.w}
              </div>
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {ph.items.map((it) => (
                <li key={it} className="text-body flex gap-2 text-sm">
                  <ChevronRight className="text-mute mt-0.5 h-3.5 w-3.5 shrink-0" />
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
