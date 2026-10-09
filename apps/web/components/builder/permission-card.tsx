"use client"

import { useState } from "react"
import { Check, ShieldAlert, X } from "lucide-react"

import type { Message } from "@/lib/types"
import { displayToast } from "@/lib/toast"

// Agent permission request with Allow/Deny and an expandable details list.
// Mock: the decision is only local.
export function PermissionCard({ m }: { m: Message }) {
  const [state, setState] = useState<"pending" | "allowed" | "denied">(
    "pending",
  )
  const [open, setOpen] = useState(false)
  return (
    <div className="border-hairline rounded-sm border">
      <div className="flex items-center gap-2 px-3 py-2">
        <ShieldAlert className="text-ink h-4 w-4" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {m.permissionTitle}
          </div>
          <div className="text-mute truncate text-[11px]">
            {m.permissionDetail}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {state === "pending" ? (
            <>
              <button
                onClick={() => setOpen((o) => !o)}
                className="text-mute hover:text-ink px-2 py-1 text-[11px]"
              >
                View
              </button>
              <button
                onClick={() => {
                  setState("denied")
                  displayToast("Denied (mock)")
                }}
                className="border-hairline-strong flex items-center gap-1 rounded-sm border px-2.5 py-1 text-xs"
              >
                <X className="h-3 w-3" /> Deny
              </button>
              <button
                onClick={() => {
                  setState("allowed")
                  displayToast("Allowed — agent proceeding")
                }}
                className="bg-ink text-on-primary flex items-center gap-1 rounded-sm px-2.5 py-1 text-xs"
              >
                <Check className="h-3 w-3" /> Allow
              </button>
            </>
          ) : (
            <span
              className={`rounded-sm px-2 py-1 text-[10px] ${
                state === "allowed"
                  ? "bg-success/15 text-ink"
                  : "bg-surface-card text-mute"
              }`}
            >
              {state === "allowed" ? "Allowed" : "Denied"}
            </span>
          )}
        </div>
      </div>
      {open && (
        <div className="hairline-t text-body bg-surface-soft px-3 py-2 text-[12px]">
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
