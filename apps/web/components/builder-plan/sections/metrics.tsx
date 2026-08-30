import { FileText } from "lucide-react"

import { SectionTitle } from "@/components/builder-plan/sections/section-title"
import { Panel } from "@/components/builder-plan/sections/panel"
import { ScheduleButton } from "@/components/builder-plan/sections/schedule-button"

const METRICS: [string, string, string][] = []

export function Metrics() {
  return (
    <div className="space-y-5">
      <SectionTitle label="success metrics" hint="What 'done' looks like once the MVP is live." />
      {METRICS.length === 0 && <p className="text-[12px] text-mute">No metrics defined yet.</p>}
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
        {METRICS.map(([k, v, d]) => (
          <div key={k} className="border border-hairline rounded-sm p-4 bg-canvas">
            <div className="text-[11px] uppercase tracking-widest text-mute">{k}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{v}</div>
            <div className="text-[12px] text-mute mt-0.5">{d}</div>
          </div>
        ))}
      </div>
      <Panel title="next checkpoint">
        <div className="flex items-start gap-3">
          <FileText className="h-4 w-4 text-ink mt-0.5" />
          <div className="text-sm text-body">
            Re-open this plan after the next build pass to capture observed metrics and
            decide whether to expand scope.
          </div>
          <ScheduleButton />
        </div>
      </Panel>
    </div>
  )
}
