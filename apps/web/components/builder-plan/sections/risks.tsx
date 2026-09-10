import { SectionTitle } from "@/components/builder-plan/sections/section-title"
import { Panel } from "@/components/builder-plan/sections/panel"

const ROWS: [string, string, string, string][] = []

// Maps a risk level to a colored dot class.
// Used in the risks table.
function dot(v: string) {
  return v === "high"
    ? "bg-warning"
    : v === "med"
      ? "bg-ink"
      : "bg-surface-card border border-hairline"
}

// Plan section listing risks with impact, likelihood and mitigation.
// Placeholder content until the agent fills it in.
export function Risks() {
  return (
    <div className="space-y-5">
      <SectionTitle
        label="risks"
        hint="Tracked separately so build mode can flag regressions inline."
      />
      <Panel>
        <div className="text-[12px]">
          <div className="text-mute hairline-b grid grid-cols-[2fr_60px_60px_2fr] gap-3 pb-1.5 tracking-widest uppercase">
            <span>risk</span>
            <span>likely</span>
            <span>impact</span>
            <span>mitigation</span>
          </div>
          {ROWS.length === 0 && (
            <p className="text-mute py-2 text-[12px]">No risks logged yet.</p>
          )}
          {ROWS.map(([r, l, im, mi]) => (
            <div
              key={r}
              className="border-hairline grid grid-cols-[2fr_60px_60px_2fr] items-center gap-3 border-b py-2 last:border-0"
            >
              <span className="text-ink text-sm">{r}</span>
              <span className="text-body flex items-center gap-1.5 text-[12px]">
                <span className={`h-2 w-2 rounded-full ${dot(l!)}`} />
                {l}
              </span>
              <span className="text-body flex items-center gap-1.5 text-[12px]">
                <span className={`h-2 w-2 rounded-full ${dot(im!)}`} />
                {im}
              </span>
              <span className="text-body text-[12px]">{mi}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
