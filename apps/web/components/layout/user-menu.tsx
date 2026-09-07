"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Activity,
  Archive,
  Cable,
  CreditCard,
  LogIn,
  LogOut,
  User,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@forgeAI/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@forgeAI/ui/components/dropdown-menu"

import { authClient } from "@/lib/auth-client"
import { useSession } from "@/hooks/use-session"

// Returns up to two initials from a name (or "U").
// Used for the avatar fallback.
function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  const letters =
    parts.length > 1
      ? [parts[0]![0], parts[parts.length - 1]![0]]
      : [parts[0]?.[0], parts[0]?.[1]]
  return letters.filter(Boolean).join("").toUpperCase() || "U"
}

// Account menu with links to profile, usage, archive, billing and log out.
// Shows a log-in button when signed out.
export function UserMenu() {
  const router = useRouter()
  const { session, isPending } = useSession()

  if (isPending) {
    return <div className="bg-surface-soft h-[58px] animate-pulse rounded-sm" />
  }

  if (!session) {
    return (
      <Link
        href="/signin"
        className="bg-ink text-on-primary hover:bg-ink-deep flex h-10 items-center justify-center gap-2 rounded-sm px-3 text-sm font-medium"
      >
        <LogIn className="h-4 w-4" /> Log in
      </Link>
    )
  }

  const { name, email } = session.user

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="bg-surface-soft hover:bg-surface-card flex w-full items-center gap-3 rounded-sm p-3">
          <Avatar className="bg-ink text-on-primary rounded-full">
            <AvatarFallback className="bg-ink text-on-primary rounded-full text-xs font-bold">
              {initials(name || email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 text-left">
            <div className="truncate text-sm font-medium">{name || email}</div>
            <div className="text-mute truncate text-[11px]">{email}</div>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={8}
        className="border-hairline w-56 rounded-sm"
      >
        <DropdownMenuLabel className="text-mute truncate text-[11px] tracking-widest uppercase">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <User className="h-3.5 w-3.5" /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/connections">
            <Cable className="h-3.5 w-3.5" /> Connect
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/usage">
            <Activity className="h-3.5 w-3.5" /> Usage
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/collaborators">
            <Users className="h-3.5 w-3.5" /> Collaborators
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/archive">
            <Archive className="h-3.5 w-3.5" /> Archive
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/plan">
            <CreditCard className="h-3.5 w-3.5" /> Plan & billing
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={async () => {
            await authClient.signOut()
            toast("Logged out")
            router.push("/signin")
            router.refresh()
          }}
        >
          <LogOut className="h-3.5 w-3.5" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
