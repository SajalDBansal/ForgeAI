"use client"

import { useState } from "react"
import { Cloud, Eye, EyeOff, Key, Plus, Trash2 } from "lucide-react"

import { INITIAL_SECRETS, type Secret } from "@/lib/builder-data"
import { displayToast } from "@/lib/toast"

export function CloudTab() {
  const [secrets, setSecrets] = useState<Secret[]>(INITIAL_SECRETS)
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState("")
  const [newVal, setNewVal] = useState("")

  const add = () => {
    if (!newKey.trim()) return
    setSecrets((p) => [{ key: newKey.trim().toUpperCase(), value: newVal || "••••", scope: "runtime", updated: "just now" }, ...p])
    setNewKey("")
    setNewVal("")
    setAdding(false)
    displayToast("Secret saved to Cloud (demo)")
  }

  return (
    <div className="flex-1 overflow-y-auto bg-canvas">
      <div className="max-w-3xl mx-auto px-5 md:px-8 py-8 space-y-6">
        <header>
          <div className="text-[11px] uppercase tracking-widest text-mute flex items-center gap-1.5">
            <Cloud className="h-3 w-3" /> [ cloud · secrets ]
          </div>
          <h2 className="mt-1 text-xl font-bold">Environment & secrets</h2>
          <p className="mt-1 text-sm text-body max-w-xl">
            Values stored here are injected into your app at runtime. The agent will ask you to
            add a key here whenever the build needs a new variable — then press{" "}
            <kbd className="px-1 border border-hairline rounded-sm text-[10px]">OK</kbd> in the chat.
          </p>
        </header>

        <div className="border border-hairline rounded-sm">
          <div className="px-3 py-2 hairline-b flex items-center gap-2">
            <Key className="h-3.5 w-3.5 text-mute" />
            <span className="text-sm font-medium">{secrets.length} secrets</span>
            <button
              onClick={() => setAdding((a) => !a)}
              className="ml-auto h-7 px-2.5 bg-ink text-on-primary text-xs rounded-sm flex items-center gap-1.5 hover:bg-ink-deep"
            >
              <Plus className="h-3 w-3" /> Add secret
            </button>
          </div>

          {adding && (
            <div className="hairline-b p-3 grid sm:grid-cols-[1fr_1fr_auto] gap-2 bg-surface-soft">
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="KEY_NAME"
                className="h-8 px-2 border border-hairline rounded-sm bg-canvas text-sm font-mono focus:outline-none focus:border-ink"
              />
              <input
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                placeholder="value"
                type="password"
                className="h-8 px-2 border border-hairline rounded-sm bg-canvas text-sm font-mono focus:outline-none focus:border-ink"
              />
              <div className="flex gap-1.5">
                <button onClick={() => setAdding(false)} className="h-8 px-2.5 border border-hairline rounded-sm text-xs">
                  Cancel
                </button>
                <button onClick={add} className="h-8 px-2.5 bg-ink text-on-primary rounded-sm text-xs">
                  Save
                </button>
              </div>
            </div>
          )}

          <ul className="divide-y divide-hairline">
            {secrets.map((s) => (
              <li key={s.key} className="px-3 py-2.5 flex items-center gap-3 font-mono text-[12.5px]">
                <Key className="h-3.5 w-3.5 text-mute shrink-0" />
                <span className="text-ink w-52 truncate">{s.key}</span>
                <span className="flex-1 text-body truncate">
                  {shown[s.key] ? s.value : s.value.replace(/./g, "•").slice(0, 24)}
                </span>
                <span className="text-[10px] text-mute px-1.5 border border-hairline rounded-sm">{s.scope}</span>
                <span className="text-[10px] text-mute hidden sm:inline">{s.updated}</span>
                <button
                  onClick={() => setShown((p) => ({ ...p, [s.key]: !p[s.key] }))}
                  className="h-6 w-6 grid place-items-center text-mute hover:text-ink"
                >
                  {shown[s.key] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => {
                    setSecrets((p) => p.filter((x) => x.key !== s.key))
                    displayToast(`Removed ${s.key} (demo)`)
                  }}
                  className="h-6 w-6 grid place-items-center text-mute hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="border border-hairline rounded-sm p-4 bg-surface-soft">
          <div className="text-[11px] uppercase tracking-widest text-mute mb-1">[ how it works ]</div>
          <ul className="text-sm text-body space-y-1.5">
            <li>[+] Secrets are encrypted at rest and injected as environment variables.</li>
            <li>[+] The agent references them by name — the value is never sent back to the chat.</li>
            <li>[+] Rotate a key by removing it and adding again; the running app picks it up on next build.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
