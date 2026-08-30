export function Chart({ range }: { range: "7d" | "30d" | "90d" }) {
  const n = range === "7d" ? 7 : range === "30d" ? 30 : 90
  const bars = Array.from(
    { length: n },
    (_, i) => 30 + Math.round(Math.abs(Math.sin(i * 1.3) * 60) + (i % 4) * 8)
  )
  const max = Math.max(...bars)
  return (
    <div className="h-32 flex items-end gap-0.5">
      {bars.map((b, i) => (
        <div
          key={i}
          className="flex-1 bg-ink/80 hover:bg-ink rounded-t-sm transition-colors"
          style={{ height: `${(b / max) * 100}%`, minHeight: 2 }}
          title={`${b * 100} tokens`}
        />
      ))}
    </div>
  )
}
