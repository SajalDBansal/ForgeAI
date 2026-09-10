import { SectionTitle } from "@/components/builder-plan/sections/section-title"
import { Panel } from "@/components/builder-plan/sections/panel"

const GROUPS: { g: string; items: [string, string][] }[] = []

// Plan section listing the proposed tech stack.
// Placeholder content until the agent fills it in.
export function Stack() {
  return (
    <div className="space-y-5">
      <SectionTitle
        label="stack"
        hint="Locked choices the build pass will scaffold against."
      />
      {GROUPS.length === 0 && (
        <p className="text-mute text-[12px]">No stack chosen yet.</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {GROUPS.map((g) => (
          <Panel key={g.g} title={g.g.toLowerCase()}>
            <ul className="space-y-1.5">
              {g.items.map(([n, d]) => (
                <li key={n} className="flex items-baseline gap-2 text-sm">
                  <span className="text-mute">[+]</span>
                  <span className="font-medium">{n}</span>
                  <span className="text-mute text-[12px]">— {d}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </div>
  )
}
