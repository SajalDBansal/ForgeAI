"use client"

import { useState } from "react"
import { Activity, Cpu, FileCode, MessageSquare } from "lucide-react"

import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { Metric } from "@/components/usage/metric"
import { Chart } from "@/components/usage/chart"

const HISTORY = [
  { time: "10:42", project: "fintech-landing", action: "Generated 5 files", tokens: 8421 },
  { time: "10:38", project: "fintech-landing", action: "Asked: design tone?", tokens: 312 },
  { time: "10:31", project: "fintech-landing", action: "Plan drafted", tokens: 1840 },
  { time: "Yesterday 18:22", project: "ops-dashboard", action: "Refactored 3 components", tokens: 5620 },
  { time: "Yesterday 17:50", project: "ops-dashboard", action: "Added dark mode", tokens: 4108 },
  { time: "Yesterday 12:11", project: "writer-portfolio", action: "Deployed preview", tokens: 220 },
  { time: "Jun 27 09:04", project: "crypto-terminal", action: "Initial scaffold", tokens: 12640 },
]

export function PlatformView() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d")
  const total = HISTORY.reduce((a, h) => a + h.tokens, 0)
  const ctxUsed = 28640
  const ctxMax = 128000
  const pct = Math.round((ctxUsed / ctxMax) * 100)

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-4 gap-3">
        <Metric icon={<Cpu className="h-4 w-4" />} label="Tokens this cycle" value="312,408" delta="+18%" />
        <Metric icon={<MessageSquare className="h-4 w-4" />} label="Agent turns" value="1,284" delta="+9%" />
        <Metric icon={<FileCode className="h-4 w-4" />} label="Files generated" value="538" delta="+22%" />
        <Metric icon={<Activity className="h-4 w-4" />} label="Active projects" value="6" delta="−1" deltaTone="warning" />
      </div>

      <PageCard className="p-5">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader label="Context window — fintech-landing" />
          <span className="text-xs text-mute font-mono">
            {ctxUsed.toLocaleString()} / {ctxMax.toLocaleString()} tokens
          </span>
        </div>
        <div className="h-2 w-full bg-surface-card rounded-sm overflow-hidden">
          <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
          {[
            { l: "System prompt", v: 1240, c: "bg-mute" },
            { l: "Project files", v: 14200, c: "bg-ink" },
            { l: "Conversation", v: 9800, c: "bg-charcoal" },
            { l: "Tool calls", v: 3400, c: "bg-stone" },
          ].map((s) => (
            <div key={s.l}>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-sm ${s.c}`} />
                <span className="text-mute">{s.l}</span>
              </div>
              <div className="font-mono">{s.v.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </PageCard>

      <PageCard className="p-5">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader label="Token usage over time" />
          <div className="flex border border-hairline rounded-sm text-xs">
            {(["7d", "30d", "90d"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`h-7 px-3 ${range === r ? "bg-ink text-on-primary" : ""}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <Chart range={range} />
      </PageCard>

      <PageCard className="p-5">
        <SectionHeader label={`Recent activity · ${HISTORY.length} events`} hint={`${total.toLocaleString()} tokens shown`} />
        <ul className="divide-y divide-hairline -mx-2 font-mono text-sm">
          {HISTORY.map((h, i) => (
            <li key={i} className="px-2 py-2.5 grid grid-cols-[120px_180px_1fr_auto] gap-3 items-center">
              <span className="text-mute text-xs">{h.time}</span>
              <span className="text-ink truncate">{h.project}</span>
              <span className="text-body truncate">{h.action}</span>
              <span className="text-mute text-xs">{h.tokens.toLocaleString()} tok</span>
            </li>
          ))}
        </ul>
      </PageCard>
    </div>
  )
}
