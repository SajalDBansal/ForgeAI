"use client"

import { useState, type FormEvent } from "react"

import { ModalShell, btnGhost, btnPrimary } from "@/components/modal/modal-shell"
import { displayToast } from "@/lib/toast"

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL

export function RenderConnectDialog({
  onClose,
  onConnected,
}: {
  onClose: () => void
  onConnected: () => void
}) {
  const [apiKey, setApiKey] = useState("")
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = apiKey.trim()
    if (!trimmed) return

    setLoading(true)
    try {
      const res = await fetch(`${AUTH_URL}/api/v1/connections/render`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      })
      if (!res.ok) {
        displayToast("Could not verify that Render API key")
        return
      }
      const data = (await res.json()) as { ownerName: string }
      displayToast(`Connected to Render as ${data.ownerName}`)
      onConnected()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell
      title="Connect Render"
      subtitle="Paste a Render API key — find it under Account Settings → API Keys."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button type="submit" form="render-connect-form" disabled={loading} className={btnPrimary}>
            {loading ? "Verifying…" : "Connect"}
          </button>
        </>
      }
    >
      <form id="render-connect-form" onSubmit={submit}>
        <label className="block">
          <div className="text-[11px] uppercase tracking-widest text-mute mb-1.5">API key</div>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type="password"
            autoFocus
            required
            placeholder="rnd_••••••••••••••••••••••••"
            className="w-full h-10 bg-canvas border border-hairline rounded-sm px-3 text-sm font-mono focus:outline-none focus:border-ink"
          />
        </label>
      </form>
    </ModalShell>
  )
}
