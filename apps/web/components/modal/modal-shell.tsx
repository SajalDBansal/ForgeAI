import type { ReactNode } from "react"
import Link from "next/link"
import { X } from "lucide-react"

// Standard dialog frame: overlay, header with close, body and optional footer.
// Clicking the overlay closes it; without onClose the X links home.
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
      className="bg-ink/40 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${width} bg-canvas border-hairline-strong rounded-sm border shadow-2xl`}
      >
        <header className="hairline-b flex items-start gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-mute text-[11px] tracking-widest uppercase">
              [ dialog ]
            </div>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight">{title}</h2>
            {subtitle && <p className="text-body mt-1 text-sm">{subtitle}</p>}
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
          <footer className="hairline-t flex items-center justify-end gap-2 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

/** Class names for a dialog's primary action button. */
export const btnPrimary =
  "h-9 px-4 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep inline-flex items-center gap-2"
/** Class names for a dialog's secondary (ghost) button. */
export const btnGhost =
  "h-9 px-4 border border-hairline rounded-sm text-sm font-medium hover:bg-surface-soft inline-flex items-center gap-2"
