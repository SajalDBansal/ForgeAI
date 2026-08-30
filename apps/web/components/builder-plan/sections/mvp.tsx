import { SectionTitle } from "@/components/builder-plan/sections/section-title"
import { Panel } from "@/components/builder-plan/sections/panel"

const ITEMS: { p: string; title: string; note: string }[] = []

const TONE: Record<string, string> = {
  must: "bg-ink text-on-primary",
  should: "bg-surface-card text-ink",
  could: "bg-surface-soft text-body border border-hairline",
  wont: "border border-hairline text-mute",
}

export function MVP() {
  return (
    <div className="space-y-5">
      <SectionTitle label="mvp scope" hint="MoSCoW prioritization. Only 'must' items block the first build." />
      <Panel title="requirements">
        {ITEMS.length === 0 && <p className="text-[12px] text-mute">No requirements yet.</p>}
        <ul className="divide-y divide-hairline">
          {ITEMS.map((i) => (
            <li key={i.title} className="py-2.5 flex items-start gap-3">
              <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm shrink-0 ${TONE[i.p]}`}>
                {i.p}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{i.title}</div>
                <div className="text-[12px] text-mute">{i.note}</div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
