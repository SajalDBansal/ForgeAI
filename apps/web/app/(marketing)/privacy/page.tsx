import type { Metadata } from "next"

import { PageShell } from "@/components/layout/page-shell"
import { PageCard } from "@/components/layout/page-card"

export const metadata: Metadata = { title: "Privacy — ForgeAI" }

const SECTIONS = [
  {
    h: "Overview",
    b: "ForgeAI is a frontend-only demonstration. No production data, accounts, or telemetry are transmitted from this app to any backend.",
  },
  {
    h: "What we collect",
    b: "In this demo build, all state — including prompts, file edits, and conversation history — lives in your browser's session storage. Nothing is persisted server-side.",
  },
  {
    h: "Cookies",
    b: "We use a single first-party cookie to remember your theme preference. No third-party trackers are installed.",
  },
  {
    h: "Third-party services",
    b: "When connected to GitHub (demo), repository metadata may be exchanged with GitHub under their own privacy policy.",
  },
  {
    h: "Children",
    b: "ForgeAI is not directed at children under 13. Do not use this service if you do not meet the age requirements of your jurisdiction.",
  },
  {
    h: "Your rights",
    b: "You may export or delete any project at any time from the workspace header. Account deletion clears all local state.",
  },
  {
    h: "Contact",
    b: "Questions? Reach the team at privacy@forgeai.demo — replies are not guaranteed for this demo.",
  },
]

// Privacy policy page, rendered from SECTIONS.
// Static legal page.
export default function PrivacyPage() {
  return (
    <PageShell breadcrumbs={[{ label: "privacy" }]}>
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <PageCard className="p-5">
          <div className="text-mute mb-2 text-[11px] tracking-widest uppercase">
            Last updated · June 29, 2026
          </div>
          <p className="text-body text-sm">
            This policy describes how ForgeAI (the &quot;service&quot;) handles
            your data. Plain English, with the legal sections kept short on
            purpose.
          </p>
        </PageCard>

        <ol className="space-y-5">
          {SECTIONS.map((s, i) => (
            <li key={s.h} className="flex gap-4">
              <span className="text-mute pt-0.5 font-mono text-sm">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="hairline-b flex-1 pb-5">
                <h2 className="font-bold">{s.h}</h2>
                <p className="text-body mt-1.5 text-sm leading-relaxed">
                  {s.b}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </PageShell>
  )
}
