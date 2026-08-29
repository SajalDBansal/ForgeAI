import type { Metadata } from "next"

import { PageShell } from "@/components/layout/page-shell"
import { PageCard } from "@/components/layout/page-card"

export const metadata: Metadata = { title: "Privacy — ForgeAI" }

const SECTIONS = [
  { h: "Overview", b: "ForgeAI is a frontend-only demonstration. No production data, accounts, or telemetry are transmitted from this app to any backend." },
  { h: "What we collect", b: "In this demo build, all state — including prompts, file edits, and conversation history — lives in your browser's session storage. Nothing is persisted server-side." },
  { h: "Cookies", b: "We use a single first-party cookie to remember your theme preference. No third-party trackers are installed." },
  { h: "Third-party services", b: "When connected to GitHub (demo), repository metadata may be exchanged with GitHub under their own privacy policy." },
  { h: "Children", b: "ForgeAI is not directed at children under 13. Do not use this service if you do not meet the age requirements of your jurisdiction." },
  { h: "Your rights", b: "You may export or delete any project at any time from the workspace header. Account deletion clears all local state." },
  { h: "Contact", b: "Questions? Reach the team at privacy@forgeai.demo — replies are not guaranteed for this demo." },
]

export default function PrivacyPage() {
  return (
    <PageShell breadcrumbs={[{ label: "privacy" }]}>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <PageCard className="p-5">
          <div className="text-[11px] uppercase tracking-widest text-mute mb-2">
            Last updated · June 29, 2026
          </div>
          <p className="text-sm text-body">
            This policy describes how ForgeAI (the &quot;service&quot;) handles your data. Plain
            English, with the legal sections kept short on purpose.
          </p>
        </PageCard>

        <ol className="space-y-5">
          {SECTIONS.map((s, i) => (
            <li key={s.h} className="flex gap-4">
              <span className="font-mono text-mute text-sm pt-0.5">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1 hairline-b pb-5">
                <h2 className="font-bold">{s.h}</h2>
                <p className="mt-1.5 text-sm text-body leading-relaxed">{s.b}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </PageShell>
  )
}
