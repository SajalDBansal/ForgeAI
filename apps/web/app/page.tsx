import { prisma } from "@repo/database"
import { Button } from "@repo/ui/components/button"

// Reads live data on every request instead of being statically prerendered
// at build time, when no database is reachable.
export const dynamic = "force-dynamic"

export default async function Home() {
  const users = await prisma.user.findMany({ include: { posts: true } })
  const apiHost = process.env.NEXT_PUBLIC_API_HOST ?? "http://localhost:3001"

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">turbo-starter</h1>
      <p className="text-sm text-muted-foreground">
        Next.js app talking to <code>@repo/database</code> directly, and to the{" "}
        <code>api</code> app at <code>{apiHost}</code>.
      </p>
      <Button>shadcn/ui button</Button>
      <pre className="overflow-auto rounded-md bg-secondary p-4 text-xs">
        {JSON.stringify(users, null, 2)}
      </pre>
    </main>
  )
}
