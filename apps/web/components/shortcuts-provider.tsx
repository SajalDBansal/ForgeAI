"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { displayToast } from "@/lib/toast"

const PALETTE_ITEMS: { label: string; href: string; hint?: string }[] = [
  { label: "New project", href: "/", hint: "home" },
  { label: "All projects", href: "/projects" },
  { label: "Templates", href: "/templates" },
  { label: "Usage & history", href: "/usage" },
  { label: "Collaborators", href: "/collaborators" },
  { label: "Connections", href: "/connections" },
  { label: "Settings", href: "/settings" },
  { label: "Plan & workspace", href: "/plan" },
  { label: "Help", href: "/help" },
]

export function ShortcutsProvider() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [q, setQ] = useState("")
  const pathname = usePathname()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const k = e.key.toLowerCase()

      if (k === "k" && !e.shiftKey) {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if (k === "b" && !e.shiftKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent("forge:toggle-sidebar"))
        return
      }
      if (k === "enter") {
        e.preventDefault()
        const dispatched = window.dispatchEvent(
          new CustomEvent("forge:send-message", { cancelable: true })
        )
        if (dispatched) displayToast("Sent message to agent (Cmd+Enter)")
        return
      }
      if (k === "e" && e.shiftKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent("forge:open-file"))
        displayToast("Open file in editor (Cmd+Shift+E)")
        return
      }
      if (k === "p" && e.shiftKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent("forge:run-preview"))
        displayToast("Preview refreshed (Cmd+Shift+P)")
        return
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pathname])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the palette overlay whenever route changes; this is a reaction to external navigation, not derivable during render.
    setPaletteOpen(false)
  }, [pathname])

  if (!paletteOpen) return null

  const filtered = PALETTE_ITEMS.filter(
    (i) => !q || i.label.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div
      className="fixed inset-0 z-100 bg-ink/40 flex items-start justify-center pt-[15vh] px-4"
      onClick={() => setPaletteOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-canvas border border-hairline rounded-sm shadow-xl overflow-hidden font-mono"
      >
        <div className="hairline-b px-3 py-2 flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-mute">[Cmd+K]</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command or jump to a page…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 border border-hairline rounded-sm text-mute">
            ESC
          </kbd>
        </div>
        <ul className="max-h-72 overflow-auto">
          {filtered.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setPaletteOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-soft"
              >
                <span className="text-mute">[+]</span>
                <span className="flex-1">{item.label}</span>
                <span className="text-[10px] text-mute">{item.href}</span>
              </Link>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-mute">No matches</li>
          )}
        </ul>
      </div>
    </div>
  )
}
