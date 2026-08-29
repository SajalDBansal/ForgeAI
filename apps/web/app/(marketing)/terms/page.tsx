import type { Metadata } from "next"

import { PageShell } from "@/components/layout/page-shell"
import { PageCard } from "@/components/layout/page-card"

export const metadata: Metadata = { title: "Terms — ForgeAI" }

const SECTIONS = [
  { h: "Acceptance", b: "By using ForgeAI you agree to these terms. If you do not agree, do not use the service." },
  { h: "Demo nature", b: "This deployment is a frontend prototype. No SLAs, uptime guarantees, or data persistence guarantees apply." },
  { h: "Acceptable use", b: "Do not use ForgeAI to generate malware, infringe IP, deceive users, or perform actions that are illegal in your jurisdiction." },
  { h: "Generated content", b: "You own the code you generate. The agent's suggestions are provided as-is; review them before shipping to production." },
  { h: "Third-party services", b: "Integrations such as GitHub and deployment providers are governed by their own terms." },
  { h: "Termination", b: "We may suspend access at any time for breach of these terms or to protect the service." },
  { h: "Liability", b: "To the maximum extent permitted by law, ForgeAI is not liable for indirect, incidental, or consequential damages arising from your use of the service." },
  { h: "Changes", b: "We may update these terms; material changes will be announced in the changelog." },
]

export default function TermsPage() {
  return (
    <PageShell breadcrumbs={[{ label: "terms" }]}>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <PageCard className="p-5">
          <div className="text-[11px] uppercase tracking-widest text-mute mb-2">
            Effective · June 29, 2026
          </div>
          <p className="text-sm text-body">
            Short, plain-language terms covering your use of the ForgeAI demo. Read them
            before getting started.
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
