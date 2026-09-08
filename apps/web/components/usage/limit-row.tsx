// Labelled progress bar showing used/max and percentage.
// Used for credit and budget limits.
export function LimitRow({
  label,
  used,
  max,
  pct,
  tone,
}: {
  label: string
  used: number
  max: number
  pct: number
  tone: "ink" | "warning"
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-body">{label}</span>
        <span className="text-mute font-mono">
          {used.toLocaleString()} / {max.toLocaleString()} · {pct}%
        </span>
      </div>
      <div className="bg-surface-card mt-1.5 h-2 w-full overflow-hidden rounded-sm">
        <div
          className={`h-full ${tone === "warning" ? "bg-warning" : "bg-ink"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
