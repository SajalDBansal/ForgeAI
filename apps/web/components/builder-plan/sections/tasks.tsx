import { SectionTitle } from "@/components/builder-plan/sections/section-title"
import { Panel } from "@/components/builder-plan/sections/panel"

const GROUPS: { g: string; tasks: [string, string][] }[] = []

// Plan section listing implementation tasks.
// Placeholder content until the agent fills it in.
export function Tasks() {
  return (
    <div className="space-y-5">
      <SectionTitle
        label="tasks todo"
        hint="Tracked across the planning pass. Build mode picks these up in order."
      />
      {GROUPS.length === 0 && (
        <p className="text-mute text-[12px]">No tasks yet.</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {GROUPS.map((g) => (
          <Panel
            key={g.g}
            title={g.g.toLowerCase()}
            meta={`${g.tasks.filter((t) => t[0] === "x").length}/${g.tasks.length}`}
          >
            <ul className="space-y-1">
              {g.tasks.map(([s, label]) => (
                <li key={label} className="flex items-center gap-2 text-sm">
                  <span className="text-mute w-6">[{s}]</span>
                  <span
                    className={
                      s === "x"
                        ? "text-mute line-through"
                        : s === "~"
                          ? "text-ink font-medium"
                          : "text-body"
                    }
                  >
                    {label}
                  </span>
                  {s === "~" && (
                    <span className="text-mute pulse-dot ml-auto text-[10px]">
                      drafting…
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </div>
  )
}
