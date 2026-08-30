import type { ReactNode } from "react"

export const inputCls =
  "w-full h-9 bg-canvas border border-hairline rounded-sm px-3 text-sm focus:outline-none focus:border-ink"

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
    <div className="grid sm:grid-cols-3 gap-4 py-4 hairline-b last:border-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-mute mt-0.5">{hint}</div>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  )
}
