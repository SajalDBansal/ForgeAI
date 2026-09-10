import { FileText } from "lucide-react"

import { SectionTitle } from "@/components/builder-plan/sections/section-title"
import { Panel } from "@/components/builder-plan/sections/panel"
import { ScheduleButton } from "@/components/builder-plan/sections/schedule-button"

const METRICS: [string, string, string][] = []

// Plan section for success metrics.
// Placeholder content until the agent fills it in.
export function Metrics() {
  return (
    <div className="space-y-5">
      <SectionTitle
        label="success metrics"
        hint="What 'done' looks like once the MVP is live."
      />
      {METRICS.length === 0 && (
        <p className="text-mute text-[12px]">No metrics defined yet.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {METRICS.map(([k, v, d]) => (
          <div
            key={k}
            className="border-hairline bg-canvas rounded-sm border p-4"
          >
            <div className="text-mute text-[11px] tracking-widest uppercase">
              {k}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{v}</div>
            <div className="text-mute mt-0.5 text-[12px]">{d}</div>
          </div>
        ))}
      </div>
      <Panel title="next checkpoint">
        <div className="flex items-start gap-3">
          <FileText className="text-ink mt-0.5 h-4 w-4" />
          <div className="text-body text-sm">
            Re-open this plan after the next build pass to capture observed
            metrics and decide whether to expand scope.
          </div>
          <ScheduleButton />
        </div>
      </Panel>
    </div>
  )
}
