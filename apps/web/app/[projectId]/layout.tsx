import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/get-session"

// Requires a session before opening a project.
// Wraps the project builder route.
export default async function ProjectLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession()
  if (!session) redirect("/signin")
  return children
}
