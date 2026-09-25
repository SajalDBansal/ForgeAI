import type { ReactNode } from "react"
import { Sidebar } from "@/components/layout/sidebar"

// App frame with the sidebar and a main content column.
// Wraps every signed-in page.
export function MainShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-canvas text-ink flex min-h-screen">
      <Sidebar />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
