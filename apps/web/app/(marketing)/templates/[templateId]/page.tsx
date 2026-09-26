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
import { formatRelativeTime, type TemplateDetail } from "@/lib/types"

const PREVIEW = `┌──────────────┐
│ ░░░░░  ▓▓▓░░ │
│ ░░░░   ▓▓░░░ │
│ ░░░    ░░░░░ │
└──────────────┘`

// Small "required" / "optional" label for connections and env vars.
// Required items are shown in the darker ink color.
function RequiredTag({ required }: { required: boolean }) {
  return (
    <span
      className={`text-[10px] tracking-widest uppercase ${required ? "text-ink" : "text-mute"}`}
    >
      {required ? "required" : "optional"}
    </span>
  )
}

// Shown when the template can't be loaded: asks to sign in, or says it doesn't exist.
// Keeps the breadcrumb so the user can get back to the list.
function TemplateUnavailable({
  templateId,
  unauthenticated,
}: {
  templateId: string
  unauthenticated: boolean
}) {
  return (
    <PageShell
      breadcrumbs={[
        { label: "templates", href: "/templates" },
        { label: templateId },
      ]}
    >
      <div className="text-body p-6 text-sm">
        {unauthenticated ? (
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

// Top of the template page: preview box, tag and version, long description and stats.
// Gives a quick summary before the detailed cards.
function TemplateHero({ template: t }: { template: TemplateDetail }) {
  return (
    <div className="flex flex-col gap-5 md:flex-row">
      <div className="bg-surface-soft border-hairline text-mute flex aspect-16/9 w-full shrink-0 items-center justify-center rounded-sm border font-mono text-[10px] md:w-72">
        <pre className="select-none">{PREVIEW}</pre>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-mute border-hairline rounded-sm border px-1.5 py-0.5 text-[10px] tracking-widest uppercase">
            {t.tag}
          </span>
          <span className="text-mute border-hairline rounded-sm border px-1.5 py-0.5 text-[10px] tracking-widest uppercase">
            v{t.version}
          </span>
        </div>
        <p className="text-body mt-2 max-w-2xl text-sm">{t.longDesc}</p>
        <div className="text-mute mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px]">
          <span>[+] {t.uses} uses</span>
          <span>[+] added {formatRelativeTime(t.createdAt)}</span>
          <span>[+] by {t.author}</span>
          <span>[+] {t.license} license</span>
        </div>
      </div>
    </div>
  )
}

// Page title and description from the template (generic text if it can't be loaded).
// Used by Next.js for the browser tab and link previews.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ templateId: string }>
}): Promise<Metadata> {
  const { templateId } = await params
  const result = await getTemplateDetail(templateId)

  return {
    title:
      result.status === "ok"
        ? `${result.template.name} — ForgeAI`
        : "Template — ForgeAI",
    description:
      result.status === "ok"
        ? result.template.description
        : "Template details: stack, connections, screens, and environment variables.",
  }
}

// Template detail page: stack, connections, deps, screens, env vars, schema and actions.
// Reached from the templates gallery.
export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  const result = await getTemplateDetail(templateId)

  if (result.status !== "ok") {
    return (
      <TemplateUnavailable
        templateId={templateId}
        unauthenticated={result.status === "unauthenticated"}
      />
    )
  }

  const t = result.template

  return (
    <PageShell
      breadcrumbs={[
        { label: "templates", href: "/templates" },
        { label: t.name },
      ]}
      actions={<TemplateHeaderActions templateId={t.id} />}
    >
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <Link
          href="/templates"
          className="text-mute hover:text-ink inline-flex items-center gap-1.5 text-xs"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to templates
        </Link>

        <TemplateHero template={t} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <PageCard className="p-4">
            <SectionHeader label="Stack" hint={`${t.stack.length} core`} />
            <ul className="divide-hairline divide-y text-sm">
              {t.stack.map((s) => (
                <li key={s.name} className="flex items-center gap-3 py-2">
                  <Boxes className="text-mute h-3.5 w-3.5" />
                  <span className="flex-1">{s.name}</span>
                  <span className="text-mute font-mono text-xs">
                    {s.version}
                  </span>
                </li>
              ))}
            </ul>
          </PageCard>

          <PageCard className="p-4">
            <SectionHeader
              label="Connections"
              hint={
                t.connections.length
                  ? `${t.connections.length} available`
                  : "none required"
              }
            />
            {t.connections.length === 0 ? (
              <p className="text-mute py-2 text-sm">
                Runs fully client-side — no external services needed.
              </p>
            ) : (
              <ul className="divide-hairline divide-y text-sm">
                {t.connections.map((c) => (
                  <li key={c.name} className="flex items-center gap-3 py-2">
                    <Plug className="text-mute h-3.5 w-3.5" />
                    <span className="flex-1">
                      {c.name}{" "}
                      <span className="text-mute text-xs">· {c.kind}</span>
                    </span>
                    <RequiredTag required={c.required} />
                  </li>
                ))}
              </ul>
            )}
          </PageCard>

          <PageCard className="p-4">
            <SectionHeader
              label="Dependencies"
              hint={`${t.deps.length} packages`}
            />
            <ul className="divide-hairline divide-y font-mono text-sm">
              {t.deps.map((d) => (
                <li key={d.name} className="flex items-center gap-3 py-2">
                  <Package className="text-mute h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="text-mute text-xs">{d.version}</span>
                </li>
              ))}
            </ul>
          </PageCard>

          <PageCard className="p-4">
            <SectionHeader
              label="Included screens"
              hint={`${t.screens.length} routes`}
            />
            <ul className="divide-hairline divide-y text-sm">
              {t.screens.map((s) => (
                <li key={s.path} className="flex items-start gap-3 py-2">
                  <MonitorSmartphone className="text-mute mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-mute truncate font-mono text-xs">
                        {s.path}
                      </span>
                    </div>
                    <p className="text-mute text-xs">{s.desc}</p>
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
              <p className="text-mute py-2 text-sm">
                No secrets needed to run this template.
              </p>
            ) : (
              <ul className="divide-hairline divide-y text-sm">
                {t.envVars.map((v) => (
                  <li key={v.key} className="flex items-start gap-3 py-2">
                    <KeyRound className="text-mute mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs">{v.key}</span>
                        <RequiredTag required={v.required} />
                      </div>
                      <p className="text-mute text-xs">{v.desc}</p>
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
              <p className="text-mute py-2 text-sm">
                No database — state lives in the client.
              </p>
            ) : (
              <ul className="divide-hairline divide-y text-sm">
                {t.dbSchema.map((d) => (
                  <li key={d.table} className="flex items-start gap-3 py-2">
                    <Database className="text-mute mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-medium">
                        {d.table}
                      </div>
                      <p className="text-mute truncate font-mono text-[11px]">
                        {d.cols}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PageCard>
        </div>

        <PageCard className="p-4">
          <SectionHeader label="What's included" />
          <ul className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {t.includes.map((i) => (
              <li key={i} className="flex items-center gap-2">
                <CheckCircle2 className="text-mute h-3.5 w-3.5" /> {i}
              </li>
            ))}
          </ul>
        </PageCard>

        <div className="flex items-center gap-2 pb-4">
          <TemplateFooterAction templateId={t.id} />
          <Link
            href="/templates"
            className="border-hairline hover:bg-surface-soft inline-flex h-9 items-center gap-2 rounded-sm border px-4 text-sm font-medium"
          >
            Cancel
          </Link>
        </div>
      </div>
    </PageShell>
  )
}
