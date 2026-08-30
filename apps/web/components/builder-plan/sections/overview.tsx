import { SectionTitle } from "@/components/builder-plan/sections/section-title"
import { Panel } from "@/components/builder-plan/sections/panel"
import { KV } from "@/components/builder-plan/sections/kv"

const SUCCESS_CRITERIA: string[] = []

const FACTS: { label: string; value: string }[] = []

export function Overview({ prompt }: { prompt: string }) {
  return (
    <div className="space-y-5">
      <SectionTitle label="overview" hint="High-level summary the agent will use to drive every other plan section." />
      <Panel title="brief">
        <p className="text-sm text-ink whitespace-pre-wrap">{prompt || "No brief yet."}</p>
      </Panel>
      {FACTS.length > 0 && (
        <div className="grid sm:grid-cols-3 gap-3">
          {FACTS.map((f) => (
            <KV key={f.label} label={f.label} value={f.value} />
          ))}
        </div>
      )}
      <Panel title="success criteria">
        {SUCCESS_CRITERIA.length === 0 && <p className="text-[12px] text-mute">Not defined yet.</p>}
        <ul className="text-sm space-y-1.5">
          {SUCCESS_CRITERIA.map((s) => (
            <li key={s} className="flex gap-2">
              <span className="text-mute">[+]</span>
              <span className="text-body">{s}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
