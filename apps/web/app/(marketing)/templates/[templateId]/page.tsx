import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Database,
  KeyRound,
  MonitorSmartphone,
  Package,
  Plug,
} from "lucide-react"

import { PageShell } from "@/components/layout/page-shell"
import { PageCard, SectionHeader } from "@/components/layout/page-card"
import {
  TemplateFooterAction,
  TemplateHeaderActions,
} from "@/components/templates/template-actions"
import { getTemplateDetail } from "@/lib/templates"
import { formatRelativeTime } from "@/lib/types"

const PREVIEW = `┌──────────────┐
│ ░░░░░  ▓▓▓░░ │
│ ░░░░   ▓▓░░░ │
│ ░░░    ░░░░░ │
└──────────────┘`

export async function generateMetadata({
  params,
}: {
  params: Promise<{ templateId: string }>
}): Promise<Metadata> {
  const { templateId } = await params
  const result = await getTemplateDetail(templateId)

  return {
    title: result.status === "ok" ? `${result.template.name} — ForgeAI` : "Template — ForgeAI",
    description:
      result.status === "ok"
        ? result.template.description
        : "Template details: stack, connections, screens, and environment variables.",
  }
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  const result = await getTemplateDetail(templateId)

  if (result.status !== "ok") {
    return (
      <PageShell breadcrumbs={[{ label: "templates", href: "/templates" }, { label: templateId }]}>
        <div className="p-6 text-sm text-body">
          {result.status === "unauthenticated" ? (
            <>
              Sign in to view this template.{" "}
              <Link href="/signin" className="underline underline-offset-4">
                Sign in
              </Link>
            </>
          ) : (
            <>
              No template with id <span className="font-mono">{templateId}</span>.{" "}
              <Link href="/templates" className="underline underline-offset-4">
                Back to templates
              </Link>
            </>
          )}
        </div>
      </PageShell>
    )
  }

  const t = result.template

  return (
    <PageShell
      breadcrumbs={[{ label: "templates", href: "/templates" }, { label: t.name }]}
      actions={<TemplateHeaderActions name={t.name} description={t.description} />}
    >
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Link
          href="/templates"
          className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to templates
        </Link>

        <div className="flex flex-col md:flex-row gap-5">
          <div className="aspect-16/9 w-full md:w-72 shrink-0 bg-surface-soft border border-hairline rounded-sm flex items-center justify-center font-mono text-[10px] text-mute">
            <pre className="select-none">{PREVIEW}</pre>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-mute border border-hairline rounded-sm px-1.5 py-0.5">
                {t.tag}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-mute border border-hairline rounded-sm px-1.5 py-0.5">
                v{t.version}
              </span>
            </div>
            <p className="mt-2 text-sm text-body max-w-2xl">{t.longDesc}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-mute font-mono">
              <span>[+] {t.uses} uses</span>
              <span>[+] added {formatRelativeTime(t.createdAt)}</span>
              <span>[+] by {t.author}</span>
              <span>[+] {t.license} license</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PageCard className="p-4">
            <SectionHeader label="Stack" hint={`${t.stack.length} core`} />
            <ul className="divide-y divide-hairline text-sm">
              {t.stack.map((s) => (
                <li key={s.name} className="py-2 flex items-center gap-3">
                  <Boxes className="h-3.5 w-3.5 text-mute" />
                  <span className="flex-1">{s.name}</span>
                  <span className="font-mono text-xs text-mute">{s.version}</span>
                </li>
              ))}
            </ul>
          </PageCard>

          <PageCard className="p-4">
            <SectionHeader
              label="Connections"
              hint={t.connections.length ? `${t.connections.length} available` : "none required"}
            />
            {t.connections.length === 0 ? (
              <p className="text-sm text-mute py-2">
                Runs fully client-side — no external services needed.
              </p>
            ) : (
              <ul className="divide-y divide-hairline text-sm">
                {t.connections.map((c) => (
                  <li key={c.name} className="py-2 flex items-center gap-3">
                    <Plug className="h-3.5 w-3.5 text-mute" />
                    <span className="flex-1">
                      {c.name} <span className="text-xs text-mute">· {c.kind}</span>
                    </span>
                    <span
                      className={`text-[10px] uppercase tracking-widest ${c.required ? "text-ink" : "text-mute"}`}
                    >
                      {c.required ? "required" : "optional"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PageCard>

          <PageCard className="p-4">
            <SectionHeader label="Dependencies" hint={`${t.deps.length} packages`} />
            <ul className="divide-y divide-hairline text-sm font-mono">
              {t.deps.map((d) => (
                <li key={d.name} className="py-2 flex items-center gap-3">
                  <Package className="h-3.5 w-3.5 text-mute shrink-0" />
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="text-xs text-mute">{d.version}</span>
                </li>
              ))}
            </ul>
          </PageCard>

          <PageCard className="p-4">
            <SectionHeader label="Included screens" hint={`${t.screens.length} routes`} />
            <ul className="divide-y divide-hairline text-sm">
              {t.screens.map((s) => (
                <li key={s.path} className="py-2 flex items-start gap-3">
                  <MonitorSmartphone className="h-3.5 w-3.5 text-mute mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{s.name}</span>
                      <span className="font-mono text-xs text-mute truncate">{s.path}</span>
                    </div>
                    <p className="text-xs text-mute">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </PageCard>

          <PageCard className="p-4">
            <SectionHeader
              label="Environment variables"
              hint={t.envVars.length ? `${t.envVars.length} vars` : "none"}
            />
            {t.envVars.length === 0 ? (
              <p className="text-sm text-mute py-2">No secrets needed to run this template.</p>
            ) : (
              <ul className="divide-y divide-hairline text-sm">
                {t.envVars.map((v) => (
                  <li key={v.key} className="py-2 flex items-start gap-3">
                    <KeyRound className="h-3.5 w-3.5 text-mute mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs">{v.key}</span>
                        <span
                          className={`text-[10px] uppercase tracking-widest ${v.required ? "text-ink" : "text-mute"}`}
                        >
                          {v.required ? "required" : "optional"}
                        </span>
                      </div>
                      <p className="text-xs text-mute">{v.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PageCard>

          <PageCard className="p-4">
            <SectionHeader
              label="Database schema"
              hint={t.dbSchema ? `${t.dbSchema.length} tables` : "none"}
            />
            {!t.dbSchema ? (
              <p className="text-sm text-mute py-2">No database — state lives in the client.</p>
            ) : (
              <ul className="divide-y divide-hairline text-sm">
                {t.dbSchema.map((d) => (
                  <li key={d.table} className="py-2 flex items-start gap-3">
                    <Database className="h-3.5 w-3.5 text-mute mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-medium">{d.table}</div>
                      <p className="font-mono text-[11px] text-mute truncate">{d.cols}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PageCard>
        </div>

        <PageCard className="p-4">
          <SectionHeader label="What's included" />
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {t.includes.map((i) => (
              <li key={i} className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-mute" /> {i}
              </li>
            ))}
          </ul>
        </PageCard>

        <div className="flex items-center gap-2 pb-4">
          <TemplateFooterAction name={t.name} description={t.description} />
          <Link
            href="/templates"
            className="h-9 px-4 border border-hairline rounded-sm text-sm font-medium hover:bg-surface-soft inline-flex items-center gap-2"
          >
            Cancel
          </Link>
        </div>
      </div>
    </PageShell>
  )
}
