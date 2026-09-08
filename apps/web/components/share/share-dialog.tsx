"use client"

import { useState, type FormEvent } from "react"
import { Copy, Globe, Link as LinkIcon, Lock, Mail } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@forgeAI/ui/components/select"

import {
  ModalShell,
  btnGhost,
  btnPrimary,
} from "@/components/modal/modal-shell"
import { displayToast } from "@/lib/toast"

const VISIBILITY_OPTIONS = [
  {
    id: "private",
    icon: <Lock className="h-4 w-4" />,
    name: "Private",
    desc: "Only invited collaborators can view",
  },
  {
    id: "link",
    icon: <LinkIcon className="h-4 w-4" />,
    name: "Anyone with the link",
    desc: "Unlisted, but anyone with the URL can open",
  },
  {
    id: "public",
    icon: <Globe className="h-4 w-4" />,
    name: "Public",
    desc: "Indexable, listed on your profile",
  },
] as const

// Dialog for project visibility, share link and email invites.
// Demo only: saving and invites just show toasts.
export function ShareDialog({
  projectName = "",
  onClose,
}: {
  projectName?: string
  onClose?: () => void
}) {
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
          <button
            onClick={() => (onClose ? onClose() : displayToast("Closed"))}
            className={btnGhost}
          >
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
          <div className="text-mute mb-2 text-[11px] tracking-widest uppercase">
            Visibility
          </div>
          <div className="space-y-1">
            {VISIBILITY_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => setVis(o.id)}
                className={`flex w-full items-start gap-3 rounded-sm border p-3 text-left ${
                  vis === o.id
                    ? "border-ink bg-surface-soft"
                    : "border-hairline hover:bg-surface-soft"
                }`}
              >
                <span className="mt-0.5">{o.icon}</span>
                <span className="flex-1">
                  <span className="block text-sm font-bold">{o.name}</span>
                  <span className="text-body block text-xs">{o.desc}</span>
                </span>
                <span
                  className={`h-3.5 w-3.5 rounded-full border ${
                    vis === o.id
                      ? "bg-ink border-ink"
                      : "border-hairline-strong"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {vis !== "private" && (
          <div>
            <div className="text-mute mb-2 text-[11px] tracking-widest uppercase">
              Share link
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-canvas border-hairline text-body flex h-10 flex-1 items-center truncate rounded-sm border px-3 font-mono text-sm">
                https://forge.ai/p/{projectName}
              </div>
              <button
                onClick={() => displayToast("Copied link (demo)")}
                className="border-hairline hover:bg-surface-soft inline-flex h-10 items-center gap-1.5 rounded-sm border px-3 text-sm"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-mute">Default permission:</span>
              <Select
                value={perm}
                onValueChange={(v) => setPerm(v as "view" | "edit")}
              >
                <SelectTrigger
                  size="sm"
                  className="border-hairline bg-canvas h-7 rounded-sm px-2 text-xs"
                >
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
          <div className="text-mute mb-2 text-[11px] tracking-widest uppercase">
            Invite by email
          </div>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              displayToast(`Invite sent to ${email} (demo)`)
              setEmail("")
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Mail className="text-mute absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="teammate@studio.dev"
                className="bg-canvas border-hairline focus:border-ink h-10 w-full rounded-sm border pr-3 pl-8 text-sm focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="bg-ink text-on-primary hover:bg-ink-deep h-10 rounded-sm px-4 text-sm font-medium"
            >
              Send invite
            </button>
          </form>
        </div>
      </div>
    </ModalShell>
  )
}
