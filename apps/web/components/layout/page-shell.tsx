import type { ReactNode } from "react"

import { TopBar, type Breadcrumb } from "@/components/layout/topbar"

// Page layout with a breadcrumb top bar and scrollable body.
// Used by most top-level pages.
export function PageShell({
  breadcrumbs,
  actions,
  children,
}: {
  breadcrumbs: Breadcrumb[]
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <TopBar breadcrumbs={breadcrumbs} actions={actions} />
      <div className="min-h-0 flex-1 space-y-6 overflow-auto">{children}</div>
    </>
  )
}
