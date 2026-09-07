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

// Handles the app-wide Cmd/Ctrl shortcuts by dispatching `forge:*` window events.
// Cmd+K toggles the command palette via `togglePalette`.
function handleShortcut(e: KeyboardEvent, togglePalette: () => void): void {
  const mod = e.metaKey || e.ctrlKey
  if (!mod) return
  const k = e.key.toLowerCase()

  if (k === "k" && !e.shiftKey) {
    e.preventDefault()
    togglePalette()
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
      new CustomEvent("forge:send-message", { cancelable: true }),
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
  }
}

// Registers global keyboard shortcuts and renders the Cmd+K command palette.
// Mounted once in the app shell; the palette closes on navigation.
export function ShortcutsProvider() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [q, setQ] = useState("")
  const pathname = usePathname()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) =>
      handleShortcut(e, () => setPaletteOpen((v) => !v))
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pathname])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the palette on navigation.
    setPaletteOpen(false)
  }, [pathname])

  if (!paletteOpen) return null

  const filtered = PALETTE_ITEMS.filter(
    (i) => !q || i.label.toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <div
      className="bg-ink/40 fixed inset-0 z-100 flex items-start justify-center px-4 pt-[15vh]"
      onClick={() => setPaletteOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-canvas border-hairline w-full max-w-lg overflow-hidden rounded-sm border font-mono shadow-xl"
      >
        <div className="hairline-b flex items-center gap-2 px-3 py-2">
          <span className="text-mute text-[11px] tracking-widest uppercase">
            [Cmd+K]
          </span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command or jump to a page…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <kbd className="border-hairline text-mute rounded-sm border px-1.5 py-0.5 text-[10px]">
            ESC
          </kbd>
        </div>
        <ul className="max-h-72 overflow-auto">
          {filtered.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setPaletteOpen(false)}
                className="hover:bg-surface-soft flex items-center gap-2 px-3 py-2 text-sm"
              >
                <span className="text-mute">[+]</span>
                <span className="flex-1">{item.label}</span>
                <span className="text-mute text-[10px]">{item.href}</span>
              </Link>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="text-mute px-3 py-6 text-center text-sm">
              No matches
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
