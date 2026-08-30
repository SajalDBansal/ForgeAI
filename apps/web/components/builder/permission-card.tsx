"use client"

import { useState } from "react"
import { Check, ShieldAlert, X } from "lucide-react"

import type { Message } from "@/lib/types"
import { displayToast } from "@/lib/toast"

export function PermissionCard({ m }: { m: Message }) {
  const [state, setState] = useState<"pending" | "allowed" | "denied">("pending")
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-hairline rounded-sm">
      <div className="px-3 py-2 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-ink" />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{m.permissionTitle}</div>
          <div className="text-[11px] text-mute truncate">{m.permissionDetail}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {state === "pending" ? (
            <>
              <button onClick={() => setOpen((o) => !o)} className="text-[11px] px-2 py-1 text-mute hover:text-ink">
                View
              </button>
              <button
                onClick={() => {
                  setState("denied")
                  displayToast("Denied (mock)")
                }}
                className="text-xs px-2.5 py-1 border border-hairline-strong rounded-sm flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Deny
              </button>
              <button
                onClick={() => {
                  setState("allowed")
                  displayToast("Allowed — agent proceeding")
                }}
                className="text-xs px-2.5 py-1 bg-ink text-on-primary rounded-sm flex items-center gap-1"
              >
                <Check className="h-3 w-3" /> Allow
              </button>
            </>
          ) : (
            <span
              className={`text-[10px] px-2 py-1 rounded-sm ${state === "allowed" ? "bg-success/15 text-ink" : "bg-surface-card text-mute"
                }`}
            >
              {state === "allowed" ? "Allowed" : "Denied"}
            </span>
          )}
        </div>
      </div>
      {open && (
        <div className="hairline-t px-3 py-2 text-[12px] text-body bg-surface-soft">
          <div className="text-mute mb-1">[ details ]</div>
          <ul className="space-y-0.5">
            <li>[+] src/App.tsx</li>
            <li>[+] src/components/Hero.tsx</li>
            <li>[+] src/components/Features.tsx</li>
            <li>[+] src/components/Footer.tsx</li>
            <li>[+] src/index.css</li>
            <li>[+] index.html</li>
            <li>[+] package.json</li>
            <li>[+] tailwind.config.ts</li>
          </ul>
        </div>
      )}
    </div>
  )
}
