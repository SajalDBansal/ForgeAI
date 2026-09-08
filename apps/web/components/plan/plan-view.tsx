"use client"

import { Building2, Check, Users, Zap } from "lucide-react"

import { PageCard, SectionHeader } from "@/components/layout/page-card"

// Billing isn't wired to a backend yet — every account-specific value shows NA until it is.
const NA = "NA"

const PLANS = [
  {
    id: "free",
    name: "Solo",
    features: [
      "3 projects",
      "100 messages / day",
      "Public deploys",
      "Community support",
    ],
    icon: <Users className="h-4 w-4" />,
  },
  {
    id: "pro",
    name: "Studio",
    highlight: true,
    features: [
      "Unlimited projects",
      "Unlimited messages",
      "Private deploys",
      "GitHub auto-sync",
      "Email support",
    ],
    icon: <Zap className="h-4 w-4" />,
  },
  {
    id: "team",
    name: "Team",
    features: [
      "Everything in Studio",
      "Shared workspace",
      "Roles & permissions",
      "Audit log",
      "SSO (SAML)",
    ],
    icon: <Building2 className="h-4 w-4" />,
  },
]

// Small label/value pair.
// Used in the plan and billing summaries.
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-mute text-[11px] tracking-widest uppercase">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}

// Plan and billing page: current plan, plan options and billing details.
// Billing isn't wired up yet, so values show NA and buttons are disabled.
export function PlanView() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageCard className="p-5">
        <SectionHeader label="Current workspace" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Workspace" value={NA} />
          <Stat label="Plan" value={NA} />
          <Stat label="Renews" value={NA} />
          <Stat label="Members" value={NA} />
          <Stat label="Messages this cycle" value={NA} />
          <Stat label="Projects" value={NA} />
        </div>
      </PageCard>

      <PageCard className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <SectionHeader label="Change plan" />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {PLANS.map((p) => {
            return (
              <div
                key={p.id}
                className={`border-hairline rounded-sm border p-5 ${p.highlight ? "bg-surface-soft" : "bg-canvas"}`}
              >
                <div className="text-ink flex items-center gap-2">
                  {p.icon}
                  <h3 className="font-bold">{p.name}</h3>
                  {p.highlight && (
                    <span className="bg-ink text-on-primary ml-auto rounded-sm px-1.5 py-0.5 text-[10px] tracking-widest uppercase">
                      Popular
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{NA}</span>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="text-success mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="text-body">{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  disabled
                  title="Not available yet"
                  className="border-hairline text-mute mt-5 h-9 w-full rounded-sm border text-sm font-medium"
                >
                  Choose {p.name}
                </button>
              </div>
            )
          })}
        </div>
      </PageCard>

      <PageCard className="p-5">
        <SectionHeader label="Billing" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat label="Payment method" value={NA} />
          <Stat label="Billing email" value={NA} />
        </div>
        <div className="mt-4 flex gap-2">
          <button
            disabled
            title="Not available yet"
            className="border-hairline text-mute h-9 rounded-sm border px-3 text-sm"
          >
            Update card
          </button>
          <button
            disabled
            title="Not available yet"
            className="border-hairline text-mute h-9 rounded-sm border px-3 text-sm"
          >
            Download invoices
          </button>
        </div>
      </PageCard>
    </div>
  )
}
