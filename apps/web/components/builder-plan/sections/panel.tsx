import type { ReactNode } from "react"

export function Panel({ children, title, meta }: { children: ReactNode; title?: string; meta?: string }) {
  return (
    <div className="border border-hairline rounded-sm bg-canvas">
      {title && (
        <div className="px-4 py-2.5 hairline-b text-[11px] text-mute flex items-center justify-between">
          <span>[ {title} ]</span>
          {meta && <span>{meta}</span>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}
