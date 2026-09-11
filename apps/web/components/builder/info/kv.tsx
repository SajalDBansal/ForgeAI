// A label/value row in a two-column grid.
// Used for the brief and requirements in the Info tab.
export function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-1 text-sm">
      <div className="text-mute">{label}</div>
      <div className="text-ink break-words">{value}</div>
    </div>
  )
}
