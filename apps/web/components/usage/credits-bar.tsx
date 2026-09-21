import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { LimitRow } from "@/components/usage/limit-row"
import { formatCost, type UsageSummary } from "@/lib/usage"

// Shows model spend against the configured daily and monthly budgets.
export function CreditsBar({ usage }: { usage: UsageSummary | null }) {
  const dailyMax = usage?.dailyBudgetMicros
  const monthlyMax = usage?.ownerMonthlyBudgetMicros
  const dailyUsed = usage?.today.costMicros ?? 0
  const monthlyUsed = usage?.month.costMicros ?? 0
  const dPct = dailyMax
    ? Math.min(100, Math.round((dailyUsed / dailyMax) * 100))
    : 0
  const mPct = monthlyMax
    ? Math.min(100, Math.round((monthlyUsed / monthlyMax) * 100))
    : 0

  return (
    <PageCard className="p-5">
      <SectionHeader
        label="Model spend"
        hint="Agent and knowledge graph usage"
      />
      <div className="mt-3 grid gap-5 sm:grid-cols-2">
        <LimitRow
          label="Daily model budget"
          used={Math.round(dailyUsed / 10_000) / 100}
          max={dailyMax ? Math.round(dailyMax / 10_000) / 100 : 0}
          pct={dPct}
          tone="ink"
        />
        <LimitRow
          label="Monthly owner budget"
          used={Math.round(monthlyUsed / 10_000) / 100}
          max={monthlyMax ? Math.round(monthlyMax / 10_000) / 100 : 0}
          pct={mPct}
          tone="ink"
        />
      </div>
      <div className="text-mute mt-3 text-[11px]">
        {dailyMax || monthlyMax ? (
          <>
            Today:{" "}
            <span className="text-ink font-medium">
              {formatCost(dailyUsed)}
            </span>
            {" · "}
            This month:{" "}
            <span className="text-ink font-medium">
              {formatCost(monthlyUsed)}
            </span>
          </>
        ) : (
          "No model budget is set in this environment."
        )}
      </div>
    </PageCard>
  )
}
