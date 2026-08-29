"use client"

import { PanelLeftClose, PanelLeftOpen } from "lucide-react"

export function CollapseToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={collapsed ? "Show conversation" : "Hide conversation"}
      className="hidden md:grid h-8 w-8 shrink-0 place-items-center rounded-sm text-mute hover:bg-surface-soft hover:text-ink mr-1"
    >
      {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
    </button>
  )
}
