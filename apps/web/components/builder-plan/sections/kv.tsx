// Small label/value tile.
// Used for quick facts in plan sections.
export function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-hairline bg-canvas rounded-sm border p-3">
      <div className="text-mute text-[11px] tracking-widest uppercase">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}
