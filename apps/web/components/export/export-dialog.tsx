"use client"

import { useState } from "react"
import { Cloud, Download, FileArchive, FileCode } from "lucide-react"

import { Checkbox } from "@forgeAI/ui/components/checkbox"

import {
  ModalShell,
  btnGhost,
  btnPrimary,
} from "@/components/modal/modal-shell"
import { displayToast } from "@/lib/toast"

const TARGETS = [
  {
    id: "zip",
    icon: <FileArchive className="h-4 w-4" />,
    name: "ZIP archive",
    desc: "Download the working tree as forge-project.zip",
  },
  {
    id: "cloud",
    icon: <Cloud className="h-4 w-4" />,
    name: "Cloud storage",
    desc: "Upload to S3, R2, or GCS (demo)",
  },
]

const INCLUDE_OPTIONS = [
  ["src", "Source files (src/, public/)"],
  ["assets", "Generated assets and images"],
  ["env", "Environment example (.env.example)"],
  ["history", "Agent conversation history"],
] as const

// Dialog to choose an export destination, contents and package manager.
// Demo only: exporting just shows a toast.
export function ExportDialog({ onClose }: { onClose?: () => void }) {
  const [target, setTarget] = useState("zip")
  const [pm, setPm] = useState<"bun" | "pnpm" | "npm">("bun")
  const [include, setInclude] = useState({
    src: true,
    assets: true,
    env: false,
    history: false,
  })

  return (
    <ModalShell
      title="Export project"
      subtitle="Choose a destination and what to include. Exports run locally — nothing is uploaded in this demo."
      onClose={onClose}
      footer={
        <>
          <button
            onClick={() => (onClose ? onClose() : displayToast("Cancelled"))}
            className={btnGhost}
          >
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
          <div className="text-mute mb-2 text-[11px] tracking-widest uppercase">
            Destination
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {TARGETS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTarget(t.id)}
                className={`rounded-sm border p-3 text-left ${
                  target === t.id
                    ? "border-ink bg-surface-soft"
                    : "border-hairline hover:bg-surface-soft"
                }`}
              >
                <div className="flex items-center gap-2">
                  {t.icon}
                  <span className="text-sm font-bold">{t.name}</span>
                </div>
                <p className="text-body mt-1 text-xs">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-mute mb-2 text-[11px] tracking-widest uppercase">
            Include
          </div>
          <div className="space-y-1">
            {INCLUDE_OPTIONS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 py-1.5 text-sm">
                <Checkbox
                  checked={include[k]}
                  onCheckedChange={(v) =>
                    setInclude({ ...include, [k]: v === true })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="text-mute mb-2 text-[11px] tracking-widest uppercase">
            Default package manager
          </div>
          <div className="flex gap-2">
            {(["bun", "pnpm", "npm"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPm(p)}
                className={`h-9 rounded-sm border px-4 text-sm ${
                  pm === p
                    ? "bg-ink text-on-primary border-ink"
                    : "border-hairline"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface-soft border-hairline text-body rounded-sm border p-3 font-mono text-xs">
          <div className="text-mute mb-1 text-[10px] tracking-widest uppercase">
            Preview
          </div>
          forge-project-2026-06-29.
          {target === "zip" ? "zip" : target === "github" ? "git" : "tar.gz"} ·
          412 KB · 38 files
        </div>

        <div className="text-mute flex items-center gap-3 text-xs">
          <FileCode className="h-3.5 w-3.5" />
          <span>38 files · 412 KB · Node 20 / Bun 1.1 compatible</span>
        </div>
      </div>
    </ModalShell>
  )
}
