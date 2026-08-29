import type { ReactNode } from "react"
import Link from "next/link"
import { X } from "lucide-react"

export function ModalShell({
  title,
  subtitle,
  children,
  footer,
  width = "max-w-xl",
  onClose,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  width?: string
  onClose?: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${width} bg-canvas border border-hairline-strong rounded-sm shadow-2xl`}
      >
        <header className="hairline-b px-5 py-4 flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-mute">[ dialog ]</div>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-body">{subtitle}</p>}
          </div>
          {onClose ? (
            <button onClick={onClose} className="text-mute hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <Link href="/" className="text-mute hover:text-ink">
              <X className="h-4 w-4" />
            </Link>
          )}
        </header>
        <div className="p-5">{children}</div>
        {footer && (
          <footer className="hairline-t px-5 py-3.5 flex items-center justify-end gap-2">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

export const btnPrimary =
  "h-9 px-4 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep inline-flex items-center gap-2"
export const btnGhost =
  "h-9 px-4 border border-hairline rounded-sm text-sm font-medium hover:bg-surface-soft inline-flex items-center gap-2"
