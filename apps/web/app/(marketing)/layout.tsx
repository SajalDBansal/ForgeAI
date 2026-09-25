import { MainShell } from "@/components/layout/main-shell"

// Wraps the public pages in the main app shell.
// Used by home, templates, help, invite and legal routes.
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MainShell>{children}</MainShell>
}
