import type { ReactNode } from "react"

// Bordered panel with an optional title and meta label.
// The building block of every plan section.
export function Panel({
  children,
  title,
  meta,
}: {
  children: ReactNode
  title?: string
  meta?: string
}) {
  return (
    <div className="border-hairline bg-canvas rounded-sm border">
      {title && (
        <div className="hairline-b text-mute flex items-center justify-between px-4 py-2.5 text-[11px]">
          <span>[ {title} ]</span>
          {meta && <span>{meta}</span>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}
