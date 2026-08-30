"use client"

import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { displayToast } from "@/lib/toast"

const KEYS = [
  { name: "personal-cli", created: "Jun 12", lastUsed: "2 h ago" },
  { name: "ci-pipeline", created: "May 03", lastUsed: "yesterday" },
]

export function KeysTab() {
  return (
    <PageCard className="p-5">
      <SectionHeader label="API keys" hint="Demo — keys are not real" />
      <ul className="divide-y divide-hairline -mx-2">
        {KEYS.map((k) => (
          <li key={k.name} className="px-2 py-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm font-medium">{k.name}</div>
              <div className="text-[11px] text-mute font-mono">
                forge_pk_••••••••••••{k.name.slice(-4)}
              </div>
            </div>
            <div className="text-[11px] text-mute">used {k.lastUsed}</div>
            <button
              onClick={() => displayToast("Revoked (demo)")}
              className="text-xs text-mute hover:text-danger"
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={() => displayToast("Generated key (demo)")}
        className="mt-4 h-9 px-4 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep"
      >
        Generate new key
      </button>
    </PageCard>
  )
}
