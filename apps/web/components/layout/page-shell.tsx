import type { ReactNode } from "react"

import { TopBar, type Breadcrumb } from "@/components/layout/topbar"

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
      <div className="flex-1 min-h-0 overflow-auto space-y-6">{children}</div>
    </>
  )
}
