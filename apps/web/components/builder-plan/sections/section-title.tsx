// Heading for a plan section with an optional hint.
// Shared by every plan section.
export function SectionTitle({
  label,
  hint,
}: {
  label: string
  hint?: string
}) {
  return (
    <div className="mb-4">
      <div className="text-mute text-[11px] tracking-widest uppercase">
        [ {label} ]
      </div>
      {hint && <p className="text-body mt-1 text-sm">{hint}</p>}
    </div>
  )
}
