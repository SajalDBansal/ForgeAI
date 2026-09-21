import type { UsageSummary } from "@/lib/usage"

// Simple bar chart of model tokens by day.
export function Chart({
  range,
  usage,
}: {
  range: "7d" | "30d" | "90d"
  usage: UsageSummary | null
}) {
  const n = range === "7d" ? 7 : range === "30d" ? 30 : 90
  const real = usage?.byDay.slice(-n).map((day) => day.tokens) ?? []
  const bars = real.length ? real : Array.from({ length: n }, () => 0)
  const max = Math.max(...bars)
  return (
    <div className="flex h-32 items-end gap-0.5">
      {bars.map((b, i) => (
        <div
          key={i}
          className="bg-ink/80 hover:bg-ink flex-1 rounded-t-sm transition-colors"
          style={{
            height: max > 0 ? `${(b / max) * 100}%` : "2px",
            minHeight: 2,
          }}
          title={`${b.toLocaleString()} tokens`}
        />
      ))}
    </div>
  )
}
