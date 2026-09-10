import { SectionTitle } from "@/components/builder-plan/sections/section-title"
import { Panel } from "@/components/builder-plan/sections/panel"

const ITEMS: { p: string; title: string; note: string }[] = []

const TONE: Record<string, string> = {
  must: "bg-ink text-on-primary",
  should: "bg-surface-card text-ink",
  could: "bg-surface-soft text-body border border-hairline",
  wont: "border border-hairline text-mute",
}

// Plan section for MVP scope (in and out).
// Placeholder content until the agent fills it in.
export function MVP() {
  return (
    <div className="space-y-5">
      <SectionTitle
        label="mvp scope"
        hint="MoSCoW prioritization. Only 'must' items block the first build."
      />
      <Panel title="requirements">
        {ITEMS.length === 0 && (
          <p className="text-mute text-[12px]">No requirements yet.</p>
        )}
        <ul className="divide-hairline divide-y">
          {ITEMS.map((i) => (
            <li key={i.title} className="flex items-start gap-3 py-2.5">
              <span
                className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] tracking-widest uppercase ${TONE[i.p]}`}
              >
                {i.p}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{i.title}</div>
                <div className="text-mute text-[12px]">{i.note}</div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
