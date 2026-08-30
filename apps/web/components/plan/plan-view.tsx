"use client"

import { useState } from "react"
import { Building2, Check, Users, Zap } from "lucide-react"

import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { displayToast } from "@/lib/toast"

const PLANS = [
  {
    id: "free", name: "Solo", price: "$0", per: "/mo",
    features: ["3 projects", "100 messages / day", "Public deploys", "Community support"],
    icon: <Users className="h-4 w-4" />,
  },
  {
    id: "pro", name: "Studio", price: "$24", per: "/mo", highlight: true,
    features: ["Unlimited projects", "Unlimited messages", "Private deploys", "GitHub auto-sync", "Email support"],
    icon: <Zap className="h-4 w-4" />,
  },
  {
    id: "team", name: "Team", price: "$96", per: "/mo · 5 seats",
    features: ["Everything in Studio", "Shared workspace", "Roles & permissions", "Audit log", "SSO (SAML)"],
    icon: <Building2 className="h-4 w-4" />,
  },
]

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-mute">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}

export function PlanView() {
  const [current, setCurrent] = useState("pro")
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly")

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageCard className="p-5">
        <SectionHeader label="Current workspace" />
        <div className="grid sm:grid-cols-3 gap-4">
          <Stat label="Workspace" value="forgeai-studio" />
          <Stat label="Plan" value="Studio (Monthly)" />
          <Stat label="Renews" value="Jul 29, 2026" />
          <Stat label="Members" value="3 of unlimited" />
          <Stat label="Messages this cycle" value="1,284 / unlimited" />
          <Stat label="Projects" value="6 active" />
        </div>
      </PageCard>

      <PageCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <SectionHeader label="Change plan" />
          <div className="flex border border-hairline rounded-sm text-xs">
            <button
              onClick={() => setCycle("monthly")}
              className={`h-7 px-3 ${cycle === "monthly" ? "bg-ink text-on-primary" : ""}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCycle("annual")}
              className={`h-7 px-3 ${cycle === "annual" ? "bg-ink text-on-primary" : ""}`}
            >
              Annual <span className="text-success ml-1">−20%</span>
            </button>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {PLANS.map((p) => {
            const active = current === p.id
            return (
              <div
                key={p.id}
                className={`rounded-sm border p-5 ${active ? "border-ink ring-1 ring-ink" : "border-hairline"} ${p.highlight ? "bg-surface-soft" : "bg-canvas"
                  }`}
              >
                <div className="flex items-center gap-2 text-ink">
                  {p.icon}
                  <h3 className="font-bold">{p.name}</h3>
                  {p.highlight && (
                    <span className="ml-auto text-[10px] uppercase tracking-widest bg-ink text-on-primary px-1.5 py-0.5 rounded-sm">
                      Popular
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">
                    {cycle === "annual" && p.id !== "free"
                      ? p.price.replace(/\$(\d+)/, (_, n) => `$${Math.round(Number(n) * 0.8)}`)
                      : p.price}
                  </span>
                  <span className="text-mute text-sm">{p.per}</span>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="h-3.5 w-3.5 mt-0.5 text-success shrink-0" />
                      <span className="text-body">{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => {
                    setCurrent(p.id)
                    displayToast(`Switched to ${p.name} (demo)`)
                  }}
                  disabled={active}
                  className={`mt-5 w-full h-9 rounded-sm text-sm font-medium ${active ? "border border-hairline text-mute" : "bg-ink text-on-primary hover:bg-ink-deep"
                    }`}
                >
                  {active ? "Current plan" : `Choose ${p.name}`}
                </button>
              </div>
            )
          })}
        </div>
      </PageCard>

      <PageCard className="p-5">
        <SectionHeader label="Billing" />
        <div className="grid sm:grid-cols-2 gap-4">
          <Stat label="Payment method" value="•••• 4242 · 09/28" />
          <Stat label="Billing email" value="finance@forgeai.dev" />
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => displayToast("Card updated (demo)")}
            className="h-9 px-3 border border-hairline rounded-sm text-sm hover:bg-surface-soft"
          >
            Update card
          </button>
          <button
            onClick={() => displayToast("Invoice downloaded (demo)")}
            className="h-9 px-3 border border-hairline rounded-sm text-sm hover:bg-surface-soft"
          >
            Download invoices
          </button>
        </div>
      </PageCard>
    </div>
  )
}
