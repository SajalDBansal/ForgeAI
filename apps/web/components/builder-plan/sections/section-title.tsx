export function SectionTitle({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] uppercase tracking-widest text-mute">[ {label} ]</div>
      {hint && <p className="text-sm text-body mt-1">{hint}</p>}
    </div>
  )
}
