"use client"

import { useState } from "react"
import { Activity, Cpu, FileCode, MessageSquare } from "lucide-react"

import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { Metric } from "@/components/usage/metric"
import { Chart } from "@/components/usage/chart"
import { formatCost, type UsageSummary } from "@/lib/usage"

function tokensOf(usage: UsageSummary | null): number {
  return (usage?.month.tokensIn ?? 0) + (usage?.month.tokensOut ?? 0)
}

// Usage view for builder model activity: metrics, chart and recent run costs.
export function PlatformView({ usage }: { usage: UsageSummary | null }) {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d")
  const total = tokensOf(usage)
  const today = (usage?.today.tokensIn ?? 0) + (usage?.today.tokensOut ?? 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric
          icon={<Cpu className="h-4 w-4" />}
          label="Tokens this month"
          value={total.toLocaleString()}
          delta={`${today.toLocaleString()} today`}
        />
        <Metric
          icon={<MessageSquare className="h-4 w-4" />}
          label="Agent runs"
          value={(usage?.month.agentRuns ?? 0).toLocaleString()}
          delta="this month"
        />
        <Metric
          icon={<FileCode className="h-4 w-4" />}
          label="Projects"
          value={(usage?.month.projects ?? 0).toLocaleString()}
          delta="with usage"
        />
        <Metric
          icon={<Activity className="h-4 w-4" />}
          label="Model cost"
          value={formatCost(usage?.month.costMicros ?? 0)}
          delta="this month"
        />
      </div>

      <PageCard className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <SectionHeader label="Token usage over time" />
          <div className="border-hairline flex rounded-sm border text-xs">
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
        <Chart range={range} usage={usage} />
      </PageCard>

      <PageCard className="p-5">
        <SectionHeader
          label={`Recent activity · ${usage?.recent.length ?? 0} events`}
          hint={`${total.toLocaleString()} tokens this month`}
        />
        <ul className="divide-hairline -mx-2 divide-y font-mono text-sm">
          {(usage?.recent ?? []).map((h) => (
            <li
              key={h.key}
              className="grid grid-cols-[120px_180px_1fr_auto_auto] items-center gap-3 px-2 py-2.5"
            >
              <span className="text-mute text-xs">
                {new Date(h.at).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span className="text-ink truncate">{h.project}</span>
              <span className="text-body truncate">{h.action}</span>
              <span className="text-mute text-xs">
                {h.tokens.toLocaleString()} tok
              </span>
              <span className="text-mute text-xs">
                {formatCost(h.costMicros)}
              </span>
            </li>
          ))}
          {usage && usage.recent.length === 0 && (
            <li className="text-mute px-2 py-4 text-sm">No model usage yet.</li>
          )}
        </ul>
      </PageCard>
    </div>
  )
}
