export function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 text-sm py-1">
      <div className="text-mute">{label}</div>
      <div className="text-ink break-words">{value}</div>
    </div>
  )
}
