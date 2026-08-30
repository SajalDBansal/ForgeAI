import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { LimitRow } from "@/components/usage/limit-row"

export function CreditsBar() {
  const dailyUsed = 18
  const dailyMax = 30
  const monthlyUsed = 640
  const monthlyMax = 2000
  const dPct = Math.round((dailyUsed / dailyMax) * 100)
  const mPct = Math.round((monthlyUsed / monthlyMax) * 100)

  return (
    <PageCard className="p-5">
      <SectionHeader label="Credits remaining" hint="Resets daily · monthly cycle Jul 12" />
      <div className="mt-3 grid sm:grid-cols-2 gap-5">
        <LimitRow label="Daily credits" used={dailyUsed} max={dailyMax} pct={dPct} tone="ink" />
        <LimitRow label="Monthly credits" used={monthlyUsed} max={monthlyMax} pct={mPct} tone="ink" />
      </div>
      <div className="mt-3 text-[11px] text-mute">
        [+] You have <span className="text-ink font-medium">{dailyMax - dailyUsed}</span> daily
        credits and{" "}
        <span className="text-ink font-medium">{(monthlyMax - monthlyUsed).toLocaleString()}</span>{" "}
        monthly credits left.
      </div>
    </PageCard>
  )
}
