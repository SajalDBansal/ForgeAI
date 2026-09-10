import { SectionTitle } from "@/components/builder-plan/sections/section-title"
import { Panel } from "@/components/builder-plan/sections/panel"

const TABLES: { name: string; cols: [string, string, string][] }[] = []

const RELATIONS = ""

// Plan section describing the data model.
// Placeholder content until the agent fills it in.
export function Schema() {
  return (
    <div className="space-y-5">
      <SectionTitle
        label="database schema"
        hint="Draft tables for the MVP surface. RLS policies generated in build pass."
      />
      <div className="space-y-3">
        {TABLES.length === 0 && (
          <p className="text-mute text-[12px]">No tables drafted yet.</p>
        )}
        {TABLES.map((t) => (
          <Panel key={t.name} title={t.name} meta={`${t.cols.length} columns`}>
            <div className="font-mono text-[12px]">
              <div className="text-mute hairline-b grid grid-cols-[1fr_1fr_1.5fr] gap-2 pb-1.5">
                <span>column</span>
                <span>type</span>
                <span>constraints</span>
              </div>
              {t.cols.map(([c, ty, cn]) => (
                <div
                  key={c}
                  className="border-hairline grid grid-cols-[1fr_1fr_1.5fr] gap-2 border-b py-1 last:border-0"
                >
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
            <pre className="text-body overflow-x-auto text-[12px] whitespace-pre">
              {RELATIONS}
            </pre>
          ) : (
            <p className="text-mute text-[12px]">No relations drafted yet.</p>
          )}
        </Panel>
      </div>
    </div>
  )
}
