import { Activity, Globe, Zap } from "lucide-react"

import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { Metric } from "@/components/usage/metric"
import { LimitRow } from "@/components/usage/limit-row"

const DEPLOYED_APPS = [
  { name: "fintech-landing", url: "fintech-landing.forge.app", requests: 12480, tokens: 184320, calls: 214, plan: "Pro", status: "healthy" },
  { name: "ops-dashboard", url: "ops.forge.app", requests: 4210, tokens: 92100, calls: 88, plan: "Pro", status: "healthy" },
  { name: "writer-portfolio", url: "writes.forge.app", requests: 812, tokens: 4210, calls: 12, plan: "Free", status: "healthy" },
  { name: "crypto-terminal", url: "crypto.forge.app", requests: 21400, tokens: 342100, calls: 512, plan: "Pro", status: "throttled" },
]

export function DeployedView() {
  const totalReq = DEPLOYED_APPS.reduce((a, x) => a + x.requests, 0)
  const totalTok = DEPLOYED_APPS.reduce((a, x) => a + x.tokens, 0)
  const totalCalls = DEPLOYED_APPS.reduce((a, x) => a + x.calls, 0)

  const aiUsed = 622530
  const aiMax = 2_000_000
  const aiPct = Math.round((aiUsed / aiMax) * 100)

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-3">
        <Metric icon={<Globe className="h-4 w-4" />} label="App requests" value={totalReq.toLocaleString()} delta="+12%" />
        <Metric icon={<Zap className="h-4 w-4" />} label="AI tokens (apps)" value={totalTok.toLocaleString()} delta="+27%" />
        <Metric icon={<Activity className="h-4 w-4" />} label="AI calls" value={totalCalls.toLocaleString()} delta="+6%" />
      </div>

      <PageCard className="p-5">
        <SectionHeader
          label="Deployed-app AI budget"
          hint="Tokens consumed by your live apps through the ForgeAI gateway"
        />
        <div className="mt-3">
          <LimitRow label="Monthly gateway tokens" used={aiUsed} max={aiMax} pct={aiPct} tone={aiPct > 80 ? "warning" : "ink"} />
        </div>
        <div className="mt-3 text-[11px] text-mute">
          [+] Your deployed apps have{" "}
          <span className="text-ink font-medium">{(aiMax - aiUsed).toLocaleString()}</span> tokens
          left this cycle.
        </div>
      </PageCard>

      <PageCard className="p-5">
        <SectionHeader label={`Deployed apps · ${DEPLOYED_APPS.length}`} hint="Per-app AI usage in the last 30 days" />
        <ul className="divide-y divide-hairline -mx-2">
          {DEPLOYED_APPS.map((a) => (
            <li key={a.name} className="px-2 py-3 grid grid-cols-[1fr_auto] sm:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 items-center">
              <div className="min-w-0">
                <div className="text-sm text-ink truncate">{a.name}</div>
                <div className="text-[11px] text-mute font-mono truncate">{a.url}</div>
              </div>
              <div className="hidden sm:block font-mono text-xs">
                <div className="text-mute text-[10px]">requests</div>
                <div>{a.requests.toLocaleString()}</div>
              </div>
              <div className="hidden sm:block font-mono text-xs">
                <div className="text-mute text-[10px]">ai tokens</div>
                <div>{a.tokens.toLocaleString()}</div>
              </div>
              <div className="hidden sm:block font-mono text-xs">
                <div className="text-mute text-[10px]">ai calls</div>
                <div>{a.calls.toLocaleString()}</div>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-sm ${
                  a.status === "healthy" ? "bg-success/15 text-ink" : "bg-warning/15 text-ink border border-warning/40"
                }`}
              >
                {a.status}
              </span>
            </li>
          ))}
        </ul>
      </PageCard>

      <PageCard className="p-5">
        <SectionHeader label="What counts here" />
        <ul className="text-sm text-body space-y-1.5">
          <li>[+] AI calls your deployed apps make to the ForgeAI gateway (chat, embeddings, images).</li>
          <li>[+] Charged against your workspace monthly AI budget — separate from builder credits.</li>
          <li>[+] Throttled apps continue to serve pages; only AI features pause until the cycle resets.</li>
        </ul>
      </PageCard>
    </div>
  )
}
