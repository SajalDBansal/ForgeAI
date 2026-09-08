import type { Metadata } from "next"

import { PageShell } from "@/components/layout/page-shell"
import { PageCard } from "@/components/layout/page-card"

export const metadata: Metadata = { title: "Terms — ForgeAI" }

const SECTIONS = [
  {
    h: "Acceptance",
    b: "By using ForgeAI you agree to these terms. If you do not agree, do not use the service.",
  },
  {
    h: "Demo nature",
    b: "This deployment is a frontend prototype. No SLAs, uptime guarantees, or data persistence guarantees apply.",
  },
  {
    h: "Acceptable use",
    b: "Do not use ForgeAI to generate malware, infringe IP, deceive users, or perform actions that are illegal in your jurisdiction.",
  },
  {
    h: "Generated content",
    b: "You own the code you generate. The agent's suggestions are provided as-is; review them before shipping to production.",
  },
  {
    h: "Third-party services",
    b: "Integrations such as GitHub and deployment providers are governed by their own terms.",
  },
  {
    h: "Termination",
    b: "We may suspend access at any time for breach of these terms or to protect the service.",
  },
  {
    h: "Liability",
    b: "To the maximum extent permitted by law, ForgeAI is not liable for indirect, incidental, or consequential damages arising from your use of the service.",
  },
  {
    h: "Changes",
    b: "We may update these terms; material changes will be announced in the changelog.",
  },
]

// Terms of service page, rendered from SECTIONS.
// Static legal page.
export default function TermsPage() {
  return (
    <PageShell breadcrumbs={[{ label: "terms" }]}>
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <PageCard className="p-5">
          <div className="text-mute mb-2 text-[11px] tracking-widest uppercase">
            Effective · June 29, 2026
          </div>
          <p className="text-body text-sm">
            Short, plain-language terms covering your use of the ForgeAI demo.
            Read them before getting started.
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
