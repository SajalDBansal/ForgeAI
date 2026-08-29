import { redirect } from "next/navigation"
import { MainShell } from "@/components/layout/main-shell"
import { getServerSession } from "@/lib/get-session"

export default async function SecureLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session) redirect("/signin")
  return <MainShell>{children}</MainShell>
}
