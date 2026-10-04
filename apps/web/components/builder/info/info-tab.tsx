"use client"

import { AlertTriangle, Sparkles } from "lucide-react"

import { useOpenProject, useProjectStore } from "@/lib/project-store"
import { InfoSection } from "@/components/builder/info/info-section"
import { KV } from "@/components/builder/info/kv"
import { PlanRow } from "@/components/builder/info/plan-row"

// Returns the +, − or ~ marker for a created, deleted or modified file.
// Used in the "Files changed" list.
function fileActionMark(action: string) {
  return action === "created" ? "+" : action === "deleted" ? "−" : "~"
}

// Color chips for the generated palette, or a placeholder when there is none.
// Shown under "Design system".
function ColorPalette({ colors }: { colors: { name: string; hex: string }[] }) {
  if (colors.length === 0)
    return <p className="text-mute text-[12.5px]">No palette generated yet.</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map(({ name, hex }) => (
        <div
          key={name}
          className="border-hairline flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px]"
        >
          <span
            className="border-hairline h-3 w-3 rounded-sm border"
            style={{ background: hex }}
          />
          <span>{name}</span>
        </div>
      ))}
    </div>
  )
}

// Info tab: the project's brief, agent plan, requirements, timeline, files, deps and design.
// Read-only view of what the agent has produced so far.
export function InfoTab() {
  const project = useOpenProject()
  const info = useProjectStore((s) => s.info)
  const projectName = project.name
  const prompt = project.initialPrompt ?? ""
  const files = info.filesChanged

  return (
    <div className="bg-canvas flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-10 px-5 py-8 md:px-8">
        <InfoSection title="Project brief">
          <KV label="Name" value={projectName} />
          <KV label="Prompt" value={prompt} />
          {info.brief.map(({ label, value }) => (
            <KV key={label} label={label} value={value} />
          ))}
        </InfoSection>

        <InfoSection title="Agent plan">
          {info.planSteps.length === 0 && (
            <p className="text-mute text-sm">No plan yet.</p>
          )}
          <ul className="space-y-1.5 text-sm">
            {info.planSteps.map((step) => (
              <PlanRow
                key={step.label}
                status={step.status}
                label={step.label}
              />
            ))}
          </ul>
        </InfoSection>

        <InfoSection title="Requirements">
          {info.requirements.length === 0 && (
            <p className="text-mute text-sm">Not captured yet.</p>
          )}
          {info.requirements.map(({ label, value }) => (
            <KV key={label} label={label} value={value} />
          ))}
        </InfoSection>

        <InfoSection title="Build timeline">
          {info.timeline.length === 0 && (
            <p className="text-mute text-sm">No build events yet.</p>
          )}
          <ol className="space-y-1.5 text-sm">
            {info.timeline.map(({ at, label }, i) => (
              <li key={`${at}-${i}`} className="flex gap-4">
                <span className="text-mute w-12 tabular-nums">{at}</span>
                <span className="text-body">[+] {label}</span>
              </li>
            ))}
          </ol>
        </InfoSection>

        <InfoSection title={`Files changed (${files.length})`}>
          <ul className="divide-hairline divide-y font-mono text-[12.5px]">
            {files.length === 0 && (
              <li className="text-mute py-2">No file changes yet.</li>
            )}
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 py-1.5">
                <span className="text-mute w-3">
                  {fileActionMark(f.action)}
                </span>
                <span className="truncate">{f.path}</span>
                <span className="text-mute ml-auto tabular-nums">
                  {f.additions && (
                    <span className="text-success">+{f.additions}</span>
                  )}
                  {f.deletions ? (
                    <span className="text-danger ml-1.5">−{f.deletions}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </InfoSection>

        <InfoSection title="Dependencies">
          {info.dependencies.length === 0 && (
            <p className="text-mute font-sans text-sm">No dependencies yet.</p>
          )}
          <ul className="grid gap-y-1 font-mono text-sm sm:grid-cols-2">
            {info.dependencies.map(({ name, version }) => (
              <li key={name} className="flex justify-between pr-6">
                <span className="text-body">[+] {name}</span>
                <span className="text-mute">{version}</span>
              </li>
            ))}
          </ul>
        </InfoSection>

        <InfoSection title="Design system">
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-mute mb-2 text-[11px]">Colors</div>
              <ColorPalette colors={info.colors} />
            </div>
          </div>
        </InfoSection>

        <div className="space-y-2">
          {info.disclaimers.map((w) => (
            <div
              key={w}
              className="border-warning/40 bg-warning/10 flex items-center gap-2 rounded-sm border px-3 py-2 text-sm"
            >
              <AlertTriangle className="text-warning h-3.5 w-3.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>

        <div className="text-mute hairline-t flex items-center gap-2 pt-4 text-[11px]">
          <Sparkles className="h-3 w-3" /> generated by forge-agent · session{" "}
          {info.sessionId ?? "—"}
        </div>
      </div>
    </div>
  )
}
