import type { ReactNode } from "react"

import { PageCard } from "@/components/layout/page-card"

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
      <div className="flex items-center gap-2 text-mute">
        {icon}
        <span className="text-[11px] uppercase tracking-widest">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl font-bold">{value}</div>
        <div className={`text-xs ${deltaTone === "success" ? "text-success" : "text-warning"}`}>
          {delta}
        </div>
      </div>
    </PageCard>
  )
}
