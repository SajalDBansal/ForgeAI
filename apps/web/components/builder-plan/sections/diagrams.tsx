"use client"

import { useState } from "react"

import { DIAGRAMS, DIAGRAM_VIEWS, type DiagramView } from "@/lib/plan-data"
import { displayToast } from "@/lib/toast"
import { SectionTitle } from "@/components/builder-plan/sections/section-title"
import { Panel } from "@/components/builder-plan/sections/panel"

export function Diagrams() {
  const [view, setView] = useState<DiagramView>("system")
  const active = DIAGRAM_VIEWS.find((v) => v.id === view)!

  return (
    <div className="space-y-5">
      <SectionTitle label="diagrams" hint="ASCII maps the agent will keep in sync with the plan as scope changes." />
      <div className="flex flex-wrap gap-1.5">
        {DIAGRAM_VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`text-[11px] px-2.5 py-1 rounded-sm border ${view === v.id ? "bg-ink text-on-primary border-ink" : "bg-canvas text-body border-hairline hover:border-ink"
              }`}
          >
            <span className="text-mute mr-1">[{view === v.id ? "x" : " "}]</span>
            {v.label}
          </button>
        ))}
      </div>
      <Panel title={active.label.toLowerCase()} meta="ascii · auto-generated">
        <p className="text-[12px] text-mute mb-3">{active.hint}</p>
        {DIAGRAMS[view] ? (
          <pre className="text-[12px] leading-[1.55] text-ink whitespace-pre overflow-x-auto font-mono dark-scroll">
            {DIAGRAMS[view]}
          </pre>
        ) : (
          <p className="text-[12px] text-mute">No diagram generated yet.</p>
        )}
      </Panel>
      <div className="grid sm:grid-cols-2 gap-3">
        <Panel title="legend">
          <ul className="text-[12px] space-y-1 text-body">
            <li>
              <span className="text-mute mr-2">[box]</span> service, component, or persisted entity
            </li>
            <li>
              <span className="text-mute mr-2">( )</span> start / end state in a flow
            </li>
            <li>
              <span className="text-mute mr-2">{`< >`}</span> decision branch
            </li>
            <li>
              <span className="text-mute mr-2">──▶</span> direction of data or control
            </li>
          </ul>
        </Panel>
        <Panel title="export">
          <div className="text-[12px] text-body mb-3">
            Diagrams can be exported alongside the plan markdown or rendered as Mermaid for
            downstream docs.
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => displayToast("Copied ASCII to clipboard")}
              className="text-[11px] px-2.5 py-1 border border-hairline rounded-sm hover:bg-surface-soft"
            >
              Copy ASCII
            </button>
            <button
              onClick={() => displayToast("Mermaid export queued")}
              className="text-[11px] px-2.5 py-1 border border-hairline rounded-sm hover:bg-surface-soft"
            >
              Export as Mermaid
            </button>
            <button
              onClick={() => displayToast("PNG render queued")}
              className="text-[11px] px-2.5 py-1 border border-hairline rounded-sm hover:bg-surface-soft"
            >
              Render PNG
            </button>
          </div>
        </Panel>
      </div>
    </div>
  )
}
