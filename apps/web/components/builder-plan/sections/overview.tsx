"use client"

import { useOpenProject } from "@/lib/project-store"
import { SectionTitle } from "@/components/builder-plan/sections/section-title"
import { Panel } from "@/components/builder-plan/sections/panel"
import { KV } from "@/components/builder-plan/sections/kv"

const SUCCESS_CRITERIA: string[] = []

const FACTS: { label: string; value: string }[] = []

// Plan section with the project brief, key facts and success criteria.
// The brief is the project's initial prompt.
export function Overview() {
  const prompt = useOpenProject().initialPrompt ?? ""
  return (
    <div className="space-y-5">
      <SectionTitle
        label="overview"
        hint="High-level summary the agent will use to drive every other plan section."
      />
      <Panel title="brief">
        <p className="text-ink text-sm whitespace-pre-wrap">
          {prompt || "No brief yet."}
        </p>
      </Panel>
      {FACTS.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {FACTS.map((f) => (
            <KV key={f.label} label={f.label} value={f.value} />
          ))}
        </div>
      )}
      <Panel title="success criteria">
        {SUCCESS_CRITERIA.length === 0 && (
          <p className="text-mute text-[12px]">Not defined yet.</p>
        )}
        <ul className="space-y-1.5 text-sm">
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
