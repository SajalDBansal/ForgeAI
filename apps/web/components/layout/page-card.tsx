import type { ReactNode } from "react"

export function PageCard({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`border border-hairline rounded-sm bg-surface-soft ${className}`}>
      {children}
    </div>
  )
}

export function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-[11px] uppercase tracking-widest text-mute">{label}</h2>
      {hint && <span className="text-[11px] text-mute">{hint}</span>}
    </div>
  )
}
