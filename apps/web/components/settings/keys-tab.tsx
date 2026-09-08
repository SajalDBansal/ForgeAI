"use client"

import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { displayToast } from "@/lib/toast"

const KEYS = [
  { name: "personal-cli", created: "Jun 12", lastUsed: "2 h ago" },
  { name: "ci-pipeline", created: "May 03", lastUsed: "yesterday" },
]

// Settings tab listing API keys with revoke and generate buttons.
// Demo data; keys are not real.
export function KeysTab() {
  return (
    <PageCard className="p-5">
      <SectionHeader label="API keys" hint="Demo — keys are not real" />
      <ul className="divide-hairline -mx-2 divide-y">
        {KEYS.map((k) => (
          <li key={k.name} className="flex items-center gap-3 px-2 py-3">
            <div className="flex-1">
              <div className="text-sm font-medium">{k.name}</div>
              <div className="text-mute font-mono text-[11px]">
                forge_pk_••••••••••••{k.name.slice(-4)}
              </div>
            </div>
            <div className="text-mute text-[11px]">used {k.lastUsed}</div>
            <button
              onClick={() => displayToast("Revoked (demo)")}
              className="text-mute hover:text-danger text-xs"
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={() => displayToast("Generated key (demo)")}
        className="bg-ink text-on-primary hover:bg-ink-deep mt-4 h-9 rounded-sm px-4 text-sm font-medium"
      >
        Generate new key
      </button>
    </PageCard>
  )
}
