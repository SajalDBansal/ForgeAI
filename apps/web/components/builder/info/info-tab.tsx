"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Sparkles } from "lucide-react"

import type { Message } from "@/lib/types"
import { InfoSection } from "@/components/builder/info/info-section"
import { KV } from "@/components/builder/info/kv"
import { PlanRow } from "@/components/builder/info/plan-row"

const DEPENDENCIES: [string, string][] = []

const COLORS: [string, string][] = []

const TIMELINE: [string, string][] = []

const DISCLAIMERS: string[] = []

const BRIEF_FACTS: [string, string][] = []
const REQUIREMENTS: [string, string][] = []

const PLAN_STEPS: { status: "done" | "active" | "pending"; label: string }[] = []

export function InfoTab({
  prompt,
  projectName,
  messages,
}: {
  prompt: string
  projectName: string
  messages: Message[]
}) {
  const files = messages.flatMap((m) => m.files ?? [])
  const [sessionId, setSessionId] = useState("")
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- session id is randomized display-only text that must match between server and client, so it's generated after mount rather than during render.
    setSessionId(Math.random().toString(36).slice(2, 8))
  }, [])

  return (
    <div className="flex-1 overflow-y-auto bg-canvas">
      <div className="max-w-3xl mx-auto px-5 md:px-8 py-8 space-y-10">
        <InfoSection title="Project brief">
          <KV label="Name" value={projectName} />
          <KV label="Prompt" value={prompt} />
          {BRIEF_FACTS.map(([label, value]) => (
            <KV key={label} label={label} value={value} />
          ))}
        </InfoSection>

        <InfoSection title="Agent plan">
          {PLAN_STEPS.length === 0 && <p className="text-sm text-mute">No plan yet.</p>}
          <ul className="text-sm space-y-1.5">
            {PLAN_STEPS.map((step) => (
              <PlanRow key={step.label} status={step.status} label={step.label} />
            ))}
          </ul>
        </InfoSection>

        <InfoSection title="Requirements">
          {REQUIREMENTS.length === 0 && <p className="text-sm text-mute">Not captured yet.</p>}
          {REQUIREMENTS.map(([label, value]) => (
            <KV key={label} label={label} value={value} />
          ))}
        </InfoSection>

        <InfoSection title="Build timeline">
          {TIMELINE.length === 0 && <p className="text-sm text-mute">No build events yet.</p>}
          <ol className="text-sm space-y-1.5">
            {TIMELINE.map(([t, l]) => (
              <li key={t} className="flex gap-4">
                <span className="text-mute tabular-nums w-12">{t}</span>
                <span className="text-body">[+] {l}</span>
              </li>
            ))}
          </ol>
        </InfoSection>

        <InfoSection title={`Files changed (${files.length})`}>
          <ul className="text-[12.5px] font-mono divide-y divide-hairline">
            {files.length === 0 && <li className="py-2 text-mute">No file changes yet.</li>}
            {files.map((f, i) => (
              <li key={i} className="py-1.5 flex items-center gap-2">
                <span className="text-mute w-3">{f.action === "created" ? "+" : f.action === "deleted" ? "−" : "~"}</span>
                <span className="truncate">{f.path}</span>
                <span className="ml-auto text-mute tabular-nums">
                  {f.additions && <span className="text-success">+{f.additions}</span>}
                  {f.deletions ? <span className="text-danger ml-1.5">−{f.deletions}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </InfoSection>

        <InfoSection title="Dependencies">
          {DEPENDENCIES.length === 0 && <p className="text-sm font-sans text-mute">No dependencies yet.</p>}
          <ul className="grid sm:grid-cols-2 gap-y-1 text-sm font-mono">
            {DEPENDENCIES.map(([n, v]) => (
              <li key={n} className="flex justify-between pr-6">
                <span className="text-body">[+] {n}</span>
                <span className="text-mute">{v}</span>
              </li>
            ))}
          </ul>
        </InfoSection>

        <InfoSection title="Design system">
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[11px] text-mute mb-2">Colors</div>
              {COLORS.length === 0 ? (
                <p className="text-[12.5px] text-mute">No palette generated yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {COLORS.map(([name, hex]) => (
                    <div key={name} className="flex items-center gap-1.5 text-[11px] border border-hairline rounded-sm px-1.5 py-0.5">
                      <span className="h-3 w-3 rounded-sm border border-hairline" style={{ background: hex }} />
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </InfoSection>

        <div className="space-y-2">
          {DISCLAIMERS.map((w) => (
            <div key={w} className="border border-warning/40 bg-warning/10 px-3 py-2 rounded-sm text-sm flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              <span>{w}</span>
            </div>
          ))}
        </div>

        <div className="text-[11px] text-mute pt-4 hairline-t flex items-center gap-2">
          <Sparkles className="h-3 w-3" /> generated by forge-agent · session {sessionId || "…"}
        </div>
      </div>
    </div>
  )
}
