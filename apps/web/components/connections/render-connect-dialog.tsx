"use client"

import { useState, type FormEvent } from "react"

import {
  ModalShell,
  btnGhost,
  btnPrimary,
} from "@/components/modal/modal-shell"
import { displayToast } from "@/lib/toast"
import { PUBLIC_ENV } from "@/lib/env"

const AUTH_URL = PUBLIC_ENV.AUTH_URL

// Dialog to connect Render by pasting an API key (Render has no OAuth).
// Verifies the key with the API before closing.
export function RenderConnectDialog({
  onClose,
  onConnected,
}: {
  onClose: () => void
  onConnected: () => void
}) {
  const [apiKey, setApiKey] = useState("")
  const [loading, setLoading] = useState(false)

  // Sends the key for verification and reports the connected account.
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
    } catch {
      displayToast("Could not reach the server. Try again.")
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
          <button
            type="submit"
            form="render-connect-form"
            disabled={loading}
            className={btnPrimary}
          >
            {loading ? "Verifying…" : "Connect"}
          </button>
        </>
      }
    >
      <form id="render-connect-form" onSubmit={submit}>
        <label className="block">
          <div className="text-mute mb-1.5 text-[11px] tracking-widest uppercase">
            API key
          </div>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type="password"
            autoFocus
            required
            placeholder="rnd_••••••••••••••••••••••••"
            className="bg-canvas border-hairline focus:border-ink h-10 w-full rounded-sm border px-3 font-mono text-sm focus:outline-none"
          />
        </label>
      </form>
    </ModalShell>
  )
}
