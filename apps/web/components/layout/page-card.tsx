import type { ReactNode } from "react"

// Bordered card container for page sections.
// The standard section surface across the app.
export function PageCard({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`border-hairline bg-surface-soft rounded-sm border ${className}`}
    >
      {children}
    </div>
  )
}

// Small uppercase section title with an optional hint.
// Sits at the top of a PageCard.
export function SectionHeader({
  label,
  hint,
}: {
  label: string
  hint?: string
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-mute text-[11px] tracking-widest uppercase">
        {label}
      </h2>
      {hint && <span className="text-mute text-[11px]">{hint}</span>}
    </div>
  )
}
