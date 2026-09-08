import type { ReactNode } from "react"

import { PageCard } from "@/components/layout/page-card"

// Stat card with an icon, value and change indicator.
// Used in the usage dashboards.
export function Metric({
  icon,
  label,
  value,
  delta,
  deltaTone = "success",
}: {
  icon: ReactNode
  label: string
  value: string
  delta: string
  deltaTone?: "success" | "warning"
}) {
  return (
    <PageCard className="p-4">
      <div className="text-mute flex items-center gap-2">
        {icon}
        <span className="text-[11px] tracking-widest uppercase">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl font-bold">{value}</div>
        <div
          className={`text-xs ${deltaTone === "success" ? "text-success" : "text-warning"}`}
        >
          {delta}
        </div>
      </div>
    </PageCard>
  )
}
