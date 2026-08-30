import { SectionTitle } from "@/components/builder-plan/sections/section-title"
import { Panel } from "@/components/builder-plan/sections/panel"

const ROWS: [string, string, string, string][] = []

function dot(v: string) {
  return v === "high" ? "bg-warning" : v === "med" ? "bg-ink" : "bg-surface-card border border-hairline"
}

export function Risks() {
  return (
    <div className="space-y-5">
      <SectionTitle label="risks" hint="Tracked separately so build mode can flag regressions inline." />
      <Panel>
        <div className="text-[12px]">
          <div className="grid grid-cols-[2fr_60px_60px_2fr] gap-3 text-mute pb-1.5 hairline-b uppercase tracking-widest">
            <span>risk</span>
            <span>likely</span>
            <span>impact</span>
            <span>mitigation</span>
          </div>
          {ROWS.length === 0 && <p className="py-2 text-[12px] text-mute">No risks logged yet.</p>}
          {ROWS.map(([r, l, im, mi]) => (
            <div key={r} className="grid grid-cols-[2fr_60px_60px_2fr] gap-3 py-2 border-b border-hairline last:border-0 items-center">
              <span className="text-sm text-ink">{r}</span>
              <span className="flex items-center gap-1.5 text-[12px] text-body">
                <span className={`h-2 w-2 rounded-full ${dot(l!)}`} />
                {l}
              </span>
              <span className="flex items-center gap-1.5 text-[12px] text-body">
                <span className={`h-2 w-2 rounded-full ${dot(im!)}`} />
                {im}
              </span>
              <span className="text-[12px] text-body">{mi}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
