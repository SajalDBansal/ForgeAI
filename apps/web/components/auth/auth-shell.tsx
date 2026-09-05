import type { ReactNode } from "react"
import Link from "next/link"

import { Wordmark } from "@/components/brand/wordmark"

// Two-column auth layout: a product showcase on the left, the form on the right.
// Shared by sign-in, sign-up and the password/verification screens.
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="bg-canvas text-ink grid min-h-screen lg:grid-cols-2">
      <div className="hairline-r bg-surface-soft relative hidden flex-col overflow-hidden p-10 lg:flex">
        <div className="flex items-center justify-between">
          <Link href="/">
            <Wordmark scale={1.2} />
          </Link>
          <Link
            href="/templates"
            className="text-mute hover:text-ink text-[11px] tracking-widest uppercase"
          >
            Templates
          </Link>
        </div>

        <div className="border-hairline bg-canvas mt-12 overflow-hidden rounded-sm border shadow-[0_10px_40px_-20px_rgba(15,0,0,0.25)]">
          <div className="hairline-b bg-surface-soft flex h-8 items-center gap-2 px-3">
            <span className="bg-danger/70 h-2.5 w-2.5 rounded-full" />
            <span className="bg-warning/70 h-2.5 w-2.5 rounded-full" />
            <span className="bg-success/70 h-2.5 w-2.5 rounded-full" />
            <span className="text-mute ml-2 font-mono text-[11px]">
              agent.session — live
            </span>
            <span className="text-success ml-auto flex items-center gap-1.5 text-[10px]">
              <span className="bg-success pulse-dot h-1.5 w-1.5 rounded-full" />{" "}
              building
            </span>
          </div>
          <pre className="text-body overflow-hidden px-4 py-3 font-mono text-[11px] leading-relaxed">
            {`$ forge build "fintech landing page"

[~] agent · planning
  [+] outline routes & layout
  [+] pick stack: react · tailwind
  [+] scaffold components

[~] agent · building
  [+] src/routes/index.tsx
  [+] src/components/hero.tsx
  [~] src/lib/pricing.ts
  [+] src/styles.css

[~] agent · preview
  ✓ dev server ready :8080
  ✓ 0 errors · 12 modules

> ship when you are.`}
          </pre>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4">
          {[
            {
              k: "plan + build",
              v: "Describe it; the agent plans and scaffolds.",
            },
            { k: "live preview", v: "Watch the app render as it's written." },
            { k: "deploy anywhere", v: "Ship to the edge in one prompt." },
            { k: "version history", v: "Roll back any prompt, anytime." },
          ].map((f) => (
            <div
              key={f.k}
              className="border-hairline bg-canvas rounded-sm border p-3"
            >
              <div className="text-mute mb-1 text-[11px] tracking-widest uppercase">
                [+] {f.k}
              </div>
              <div className="text-body text-xs leading-snug">{f.v}</div>
            </div>
          ))}
        </div>

        <div className="mt-auto pt-10">
          <div className="text-mute mt-6 text-[11px]">
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <span className="mx-2">·</span>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <span className="mx-2">·</span>
            <Link href="/help" className="hover:text-ink">
              Help
            </Link>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link href="/">
              <Wordmark />
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-body mt-2 text-sm">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="text-mute mt-6 text-sm">{footer}</div>}
        </div>
      </div>
    </div>
  )
}

// Labelled form field with an optional hint on the right.
// Wraps an input so clicking the label focuses it.
export function FormRow({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-mute text-xs tracking-widest uppercase">
          {label}
        </span>
        {hint && <span className="text-mute text-[11px]">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

/** Class names for a standard auth-form text input. */
export const inputCls =
  "w-full h-10 bg-canvas border border-hairline rounded-sm px-3 text-sm focus:outline-none focus:border-ink"
