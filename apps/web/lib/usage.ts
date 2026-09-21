import { apiRequest, type ApiResult } from "@/lib/api-client"

export interface UsageSummary {
  dailyBudgetMicros: number | null
  ownerMonthlyBudgetMicros: number | null
  today: { costMicros: number; tokensIn: number; tokensOut: number }
  month: {
    costMicros: number
    tokensIn: number
    tokensOut: number
    agentRuns: number
    projects: number
  }
  byDay: { day: string; costMicros: number; tokens: number }[]
  recent: {
    key: string
    at: string
    project: string
    action: string
    tokens: number
    costMicros: number
    models: string[]
  }[]
}

export function getUsageSummaryRequest(): Promise<ApiResult<UsageSummary>> {
  return apiRequest("/usage", { fallbackError: "Couldn't load usage." })
}

export function formatCost(micros: number): string {
  if (micros <= 0) return "$0.00"
  const dollars = micros / 1_000_000
  return dollars < 0.01 ? "<$0.01" : `$${dollars.toFixed(2)}`
}
