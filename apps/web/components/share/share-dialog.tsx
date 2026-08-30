"use client"

import { useState, type FormEvent } from "react"
import { Copy, Globe, Link as LinkIcon, Lock, Mail } from "lucide-react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@forgeAI/ui/components/select"

import { ModalShell, btnGhost, btnPrimary } from "@/components/modal/modal-shell"
import { displayToast } from "@/lib/toast"

const VISIBILITY_OPTIONS = [
  { id: "private", icon: <Lock className="h-4 w-4" />, name: "Private", desc: "Only invited collaborators can view" },
  { id: "link", icon: <LinkIcon className="h-4 w-4" />, name: "Anyone with the link", desc: "Unlisted, but anyone with the URL can open" },
  { id: "public", icon: <Globe className="h-4 w-4" />, name: "Public", desc: "Indexable, listed on your profile" },
] as const

export function ShareDialog({ projectName = "", onClose }: { projectName?: string; onClose?: () => void }) {
  const [vis, setVis] = useState<"private" | "link" | "public">("link")
  const [perm, setPerm] = useState<"view" | "edit">("view")
  const [email, setEmail] = useState("")

  return (
    <ModalShell
      title={`Share ${projectName}`}
      subtitle="Decide who can see this project and how they can interact with it."
      onClose={onClose}
      footer={
        <>
          <button onClick={() => (onClose ? onClose() : displayToast("Closed"))} className={btnGhost}>
            Done
          </button>
          <button
            onClick={() => {
              displayToast("Saved share settings (demo)")
              onClose?.()
            }}
            className={btnPrimary}
          >
            Save
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-mute mb-2">Visibility</div>
          <div className="space-y-1">
            {VISIBILITY_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => setVis(o.id)}
                className={`w-full text-left p-3 rounded-sm border flex items-start gap-3 ${vis === o.id ? "border-ink bg-surface-soft" : "border-hairline hover:bg-surface-soft"
                  }`}
              >
                <span className="mt-0.5">{o.icon}</span>
                <span className="flex-1">
                  <span className="block text-sm font-bold">{o.name}</span>
                  <span className="block text-xs text-body">{o.desc}</span>
                </span>
                <span
                  className={`h-3.5 w-3.5 rounded-full border ${vis === o.id ? "bg-ink border-ink" : "border-hairline-strong"
                    }`}
                />
              </button>
            ))}
          </div>
        </div>

        {vis !== "private" && (
          <div>
            <div className="text-[11px] uppercase tracking-widest text-mute mb-2">Share link</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-10 px-3 bg-canvas border border-hairline rounded-sm text-sm font-mono text-body truncate flex items-center">
                https://forge.ai/p/{projectName}
              </div>
              <button
                onClick={() => displayToast("Copied link (demo)")}
                className="h-10 px-3 border border-hairline rounded-sm text-sm hover:bg-surface-soft inline-flex items-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-mute">Default permission:</span>
              <Select value={perm} onValueChange={(v) => setPerm(v as "view" | "edit")}>
                <SelectTrigger size="sm" className="h-7 rounded-sm border-hairline bg-canvas px-2 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">Can view</SelectItem>
                  <SelectItem value="edit">Can edit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div>
          <div className="text-[11px] uppercase tracking-widest text-mute mb-2">Invite by email</div>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              displayToast(`Invite sent to ${email} (demo)`)
              setEmail("")
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Mail className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="teammate@studio.dev"
                className="w-full h-10 pl-8 pr-3 bg-canvas border border-hairline rounded-sm text-sm focus:outline-none focus:border-ink"
              />
            </div>
            <button
              type="submit"
              className="h-10 px-4 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep"
            >
              Send invite
            </button>
          </form>
        </div>
      </div>
    </ModalShell>
  )
}
