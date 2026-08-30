"use client"

import { useState } from "react"
import { Cloud, Download, FileArchive, FileCode } from "lucide-react"

import { Checkbox } from "@forgeAI/ui/components/checkbox"

import { ModalShell, btnGhost, btnPrimary } from "@/components/modal/modal-shell"
import { displayToast } from "@/lib/toast"

const TARGETS = [
  { id: "zip", icon: <FileArchive className="h-4 w-4" />, name: "ZIP archive", desc: "Download the working tree as forge-project.zip" },
  { id: "cloud", icon: <Cloud className="h-4 w-4" />, name: "Cloud storage", desc: "Upload to S3, R2, or GCS (demo)" },
]

const INCLUDE_OPTIONS = [
  ["src", "Source files (src/, public/)"],
  ["assets", "Generated assets and images"],
  ["env", "Environment example (.env.example)"],
  ["history", "Agent conversation history"],
] as const

export function ExportDialog({ onClose }: { onClose?: () => void }) {
  const [target, setTarget] = useState("zip")
  const [pm, setPm] = useState<"bun" | "pnpm" | "npm">("bun")
  const [include, setInclude] = useState({ src: true, assets: true, env: false, history: false })

  return (
    <ModalShell
      title="Export project"
      subtitle="Choose a destination and what to include. Exports run locally — nothing is uploaded in this demo."
      onClose={onClose}
      footer={
        <>
          <button onClick={() => (onClose ? onClose() : displayToast("Cancelled"))} className={btnGhost}>
            Cancel
          </button>
          <button
            onClick={() => {
              displayToast("Export started (demo)")
              onClose?.()
            }}
            className={btnPrimary}
          >
            <Download className="h-4 w-4" /> Export now
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-mute mb-2">Destination</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {TARGETS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTarget(t.id)}
                className={`text-left p-3 rounded-sm border ${target === t.id ? "border-ink bg-surface-soft" : "border-hairline hover:bg-surface-soft"
                  }`}
              >
                <div className="flex items-center gap-2">
                  {t.icon}
                  <span className="text-sm font-bold">{t.name}</span>
                </div>
                <p className="mt-1 text-xs text-body">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-widest text-mute mb-2">Include</div>
          <div className="space-y-1">
            {INCLUDE_OPTIONS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm py-1.5">
                <Checkbox
                  checked={include[k]}
                  onCheckedChange={(v) => setInclude({ ...include, [k]: v === true })}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-widest text-mute mb-2">Default package manager</div>
          <div className="flex gap-2">
            {(["bun", "pnpm", "npm"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPm(p)}
                className={`h-9 px-4 rounded-sm border text-sm ${pm === p ? "bg-ink text-on-primary border-ink" : "border-hairline"
                  }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface-soft border border-hairline rounded-sm p-3 text-xs text-body font-mono">
          <div className="text-[10px] uppercase tracking-widest text-mute mb-1">Preview</div>
          forge-project-2026-06-29.{target === "zip" ? "zip" : target === "github" ? "git" : "tar.gz"} · 412 KB
          · 38 files
        </div>

        <div className="flex items-center gap-3 text-xs text-mute">
          <FileCode className="h-3.5 w-3.5" />
          <span>38 files · 412 KB · Node 20 / Bun 1.1 compatible</span>
        </div>
      </div>
    </ModalShell>
  )
}
