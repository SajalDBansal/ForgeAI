import { SectionTitle } from "@/components/builder-plan/sections/section-title"
import { Panel } from "@/components/builder-plan/sections/panel"

const GROUPS: { g: string; tasks: [string, string][] }[] = []

export function Tasks() {
  return (
    <div className="space-y-5">
      <SectionTitle label="tasks todo" hint="Tracked across the planning pass. Build mode picks these up in order." />
      {GROUPS.length === 0 && <p className="text-[12px] text-mute">No tasks yet.</p>}
      <div className="grid md:grid-cols-2 gap-3">
        {GROUPS.map((g) => (
          <Panel key={g.g} title={g.g.toLowerCase()} meta={`${g.tasks.filter((t) => t[0] === "x").length}/${g.tasks.length}`}>
            <ul className="space-y-1">
              {g.tasks.map(([s, label]) => (
                <li key={label} className="flex items-center gap-2 text-sm">
                  <span className="text-mute w-6">[{s}]</span>
                  <span className={s === "x" ? "line-through text-mute" : s === "~" ? "text-ink font-medium" : "text-body"}>
                    {label}
                  </span>
                  {s === "~" && <span className="ml-auto text-[10px] text-mute pulse-dot">drafting…</span>}
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </div>
  )
}
