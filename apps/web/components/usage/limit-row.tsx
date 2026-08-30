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
        <span className="font-mono text-mute">
          {used.toLocaleString()} / {max.toLocaleString()} · {pct}%
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full bg-surface-card rounded-sm overflow-hidden">
        <div
          className={`h-full ${tone === "warning" ? "bg-warning" : "bg-ink"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
