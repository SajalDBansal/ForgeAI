import type { ReactNode } from "react"

// Class names for a standard settings text input.
// Shared by the settings tabs.
export const inputCls =
  "w-full h-9 bg-canvas border border-hairline rounded-sm px-3 text-sm focus:outline-none focus:border-ink"

// One labelled settings row with an optional hint.
// Lays out label and control in a responsive grid.
export function Row({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="hairline-b grid gap-4 py-4 last:border-0 sm:grid-cols-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-mute mt-0.5 text-xs">{hint}</div>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  )
}
