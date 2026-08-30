import { SectionTitle } from "@/components/builder-plan/sections/section-title"
import { Panel } from "@/components/builder-plan/sections/panel"

const TABLES: { name: string; cols: [string, string, string][] }[] = []

const RELATIONS = ""

export function Schema() {
  return (
    <div className="space-y-5">
      <SectionTitle label="database schema" hint="Draft tables for the MVP surface. RLS policies generated in build pass." />
      <div className="space-y-3">
        {TABLES.length === 0 && <p className="text-[12px] text-mute">No tables drafted yet.</p>}
        {TABLES.map((t) => (
          <Panel key={t.name} title={t.name} meta={`${t.cols.length} columns`}>
            <div className="text-[12px] font-mono">
              <div className="grid grid-cols-[1fr_1fr_1.5fr] gap-2 text-mute pb-1.5 hairline-b">
                <span>column</span>
                <span>type</span>
                <span>constraints</span>
              </div>
              {t.cols.map(([c, ty, cn]) => (
                <div key={c} className="grid grid-cols-[1fr_1fr_1.5fr] gap-2 py-1 border-b border-hairline last:border-0">
                  <span className="text-ink">{c}</span>
                  <span className="text-body">{ty}</span>
                  <span className="text-mute">{cn}</span>
                </div>
              ))}
            </div>
          </Panel>
        ))}
        <Panel title="relations">
          {RELATIONS ? (
            <pre className="text-[12px] text-body whitespace-pre overflow-x-auto">{RELATIONS}</pre>
          ) : (
            <p className="text-[12px] text-mute">No relations drafted yet.</p>
          )}
        </Panel>
      </div>
    </div>
  )
}
