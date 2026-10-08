"use client"

import { useState } from "react"
import { Cloud, Eye, EyeOff, Key, Plus, Trash2 } from "lucide-react"

import type { SecretSummary } from "@/lib/build"
import { useProjectStore } from "@/lib/project-store"
import { formatRelativeTime } from "@/lib/types"
import { useBuildActions } from "@/hooks/use-build-actions"

const MASK = "••••••••••••"

// One secret row: key, masked or revealed value, scope, age, and reveal/remove buttons.
// Buttons are disabled while an optimistic ("tmp-") row is still saving.
function SecretRow({
  secret: s,
  value,
  onToggleReveal,
  onDelete,
}: {
  secret: SecretSummary
  value: string | undefined
  onToggleReveal: () => void
  onDelete: () => void
}) {
  const pending = s.id.startsWith("tmp-")
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 font-mono text-[12.5px]">
      <Key className="text-mute h-3.5 w-3.5 shrink-0" />
      <span className="text-ink w-52 truncate">{s.key}</span>
      <span className="text-body flex-1 truncate">{value ?? MASK}</span>
      <span className="text-mute border-hairline rounded-sm border px-1.5 text-[10px] lowercase">
        {s.scope}
      </span>
      <span className="text-mute hidden text-[10px] sm:inline">
        {pending ? "saving…" : formatRelativeTime(s.updatedAt)}
      </span>
      <button
        onClick={onToggleReveal}
        disabled={pending}
        aria-label={value !== undefined ? `Hide ${s.key}` : `Reveal ${s.key}`}
        className="text-mute hover:text-ink grid h-6 w-6 place-items-center disabled:opacity-40"
      >
        {value !== undefined ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        onClick={onDelete}
        disabled={pending}
        aria-label={`Remove ${s.key}`}
        className="text-mute hover:text-danger grid h-6 w-6 place-items-center disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}

// Cloud tab: list, add, reveal and remove the project's secrets.
// Revealed values are kept only in this component, never in the shared store.
export function CloudTab() {
  const secrets = useProjectStore((s) => s.secrets)
  const { saveSecret, deleteSecret, revealSecret } = useBuildActions()
  // Revealed values live only here, never in the shared store.
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newKey, setNewKey] = useState("")
  const [newVal, setNewVal] = useState("")

  // Saves the new secret and closes the form on success.
  const add = async () => {
    if (!newKey.trim() || !newVal || saving) return
    setSaving(true)
    const saved = await saveSecret(newKey, newVal)
    setSaving(false)
    if (!saved) return
    setNewKey("")
    setNewVal("")
    setAdding(false)
  }

  // Hides a revealed value, or fetches and shows it.
  const toggleReveal = async (secret: SecretSummary) => {
    if (revealed[secret.id] !== undefined) {
      setRevealed((p) => {
        const next = { ...p }
        delete next[secret.id]
        return next
      })
      return
    }
    const value = await revealSecret(secret)
    if (value !== null) setRevealed((p) => ({ ...p, [secret.id]: value }))
  }

  return (
    <div className="bg-canvas flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-5 py-8 md:px-8">
        <header>
          <div className="text-mute flex items-center gap-1.5 text-[11px] tracking-widest uppercase">
            <Cloud className="h-3 w-3" /> [ cloud · secrets ]
          </div>
          <h2 className="mt-1 text-xl font-bold">Environment & secrets</h2>
          <p className="text-body mt-1 max-w-xl text-sm">
            Values stored here are saved outside the sandbox and injected only
            when the app runtime starts. The agent will ask you to add a key
            here whenever the build needs a new variable; then press{" "}
            <kbd className="border-hairline rounded-sm border px-1 text-[10px]">
              OK
            </kbd>{" "}
            in the chat.
          </p>
        </header>

        <div className="border-hairline rounded-sm border">
          <div className="hairline-b flex items-center gap-2 px-3 py-2">
            <Key className="text-mute h-3.5 w-3.5" />
            <span className="text-sm font-medium">
              {secrets.length} secrets
            </span>
            <button
              onClick={() => setAdding((a) => !a)}
              className="bg-ink text-on-primary hover:bg-ink-deep ml-auto flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs"
            >
              <Plus className="h-3 w-3" /> Add secret
            </button>
          </div>

          {adding && (
            <div className="hairline-b bg-surface-soft grid gap-2 p-3 sm:grid-cols-[1fr_1fr_auto]">
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="KEY_NAME"
                className="border-hairline bg-canvas focus:border-ink h-8 rounded-sm border px-2 font-mono text-sm focus:outline-none"
              />
              <input
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                placeholder="value"
                type="password"
                className="border-hairline bg-canvas focus:border-ink h-8 rounded-sm border px-2 font-mono text-sm focus:outline-none"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={() => setAdding(false)}
                  className="border-hairline h-8 rounded-sm border px-2.5 text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void add()}
                  disabled={saving || !newKey.trim() || !newVal}
                  className="bg-ink text-on-primary h-8 rounded-sm px-2.5 text-xs disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
          {adding && newKey.trim().toUpperCase().startsWith("NEXT_PUBLIC_") && (
            <p className="hairline-b text-warning bg-surface-soft px-3 py-2 text-xs">
              Names starting with NEXT_PUBLIC_ are built into the page itself,
              and preview links are public, so anyone with the link can read
              this value. Use it only for values that are safe to publish.
            </p>
          )}

          <ul className="divide-hairline divide-y">
            {secrets.length === 0 && (
              <li className="text-mute px-3 py-6 text-center text-sm">
                No secrets yet.
              </li>
            )}
            {secrets.map((s) => (
              <SecretRow
                key={s.key}
                secret={s}
                value={revealed[s.id]}
                onToggleReveal={() => void toggleReveal(s)}
                onDelete={() => void deleteSecret(s)}
              />
            ))}
          </ul>
        </div>

        <div className="border-hairline bg-surface-soft rounded-sm border p-4">
          <div className="text-mute mb-1 text-[11px] tracking-widest uppercase">
            [ how it works ]
          </div>
          <ul className="text-body space-y-1.5 text-sm">
            <li>
              [+] Secrets are encrypted at rest and given to the dev server as
              environment variables.
            </li>
            <li>
              [+] No .env file is written into the sandbox. After a change,
              restart the dev server; a server already running keeps the old
              values.
            </li>
            <li>
              [+] Agent command tools and shared terminals do not receive these
              values automatically.
            </li>
            <li>
              [!] Code running inside the app runtime can read them. Avoid
              printing them.
            </li>
            <li>
              [!] NEXT_PUBLIC_ names end up in the page, and preview links are
              public.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
