import type { ReactNode } from "react"
import Link from "next/link"

import { Wordmark } from "@/components/brand/wordmark"

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
    <div className="min-h-screen bg-canvas text-ink grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col p-10 hairline-r bg-surface-soft relative overflow-hidden">
        <div className="flex items-center justify-between">
          <Link href="/"><Wordmark scale={1.2} /></Link>
          <Link href="/templates" className="text-[11px] uppercase tracking-widest text-mute hover:text-ink">Templates</Link>
        </div>

        <div className="mt-12 border border-hairline rounded-sm bg-canvas overflow-hidden shadow-[0_10px_40px_-20px_rgba(15,0,0,0.25)]">
          <div className="flex items-center gap-2 px-3 h-8 hairline-b bg-surface-soft">
            <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
            <span className="ml-2 text-[11px] text-mute font-mono">agent.session — live</span>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success pulse-dot" /> building
            </span>
          </div>
          <pre className="px-4 py-3 text-[11px] leading-relaxed font-mono text-body overflow-hidden">
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
            { k: "plan + build", v: "Describe it; the agent plans and scaffolds." },
            { k: "live preview", v: "Watch the app render as it's written." },
            { k: "deploy anywhere", v: "Ship to the edge in one prompt." },
            { k: "version history", v: "Roll back any prompt, anytime." },
          ].map((f) => (
            <div key={f.k} className="border border-hairline rounded-sm p-3 bg-canvas">
              <div className="text-[11px] uppercase tracking-widest text-mute mb-1">[+] {f.k}</div>
              <div className="text-xs text-body leading-snug">{f.v}</div>
            </div>
          ))}
        </div>

        <div className="mt-auto pt-10">
          <div className="mt-6 text-[11px] text-mute">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <span className="mx-2">·</span>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <span className="mx-2">·</span>
            <Link href="/help" className="hover:text-ink">Help</Link>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8"><Link href="/"><Wordmark /></Link></div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-body">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-mute">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

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
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs uppercase tracking-widest text-mute">{label}</span>
        {hint && <span className="text-[11px] text-mute">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

export const inputCls =
  "w-full h-10 bg-canvas border border-hairline rounded-sm px-3 text-sm focus:outline-none focus:border-ink"
