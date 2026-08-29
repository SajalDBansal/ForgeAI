import type { ReactNode } from "react"
import { Sidebar } from "@/components/layout/sidebar"

export function MainShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-ink flex">
      <Sidebar />
      <main className="flex-1 min-w-0 min-h-0 flex flex-col">{children}</main>
    </div>
  )
}
