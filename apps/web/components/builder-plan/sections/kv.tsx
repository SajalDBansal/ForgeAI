export function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-hairline rounded-sm p-3 bg-canvas">
      <div className="text-[11px] uppercase tracking-widest text-mute">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}
