"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Activity, Archive, Cable, CreditCard, LogIn, LogOut, User, Users } from "lucide-react"
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  const letters = parts.length > 1 ? [parts[0]![0], parts[parts.length - 1]![0]] : [parts[0]?.[0], parts[0]?.[1]]
  return letters.filter(Boolean).join("").toUpperCase() || "U"
}

export function UserMenu() {
  const router = useRouter()
  const { session, isPending } = useSession()

  if (isPending) {
    return <div className="h-[58px] rounded-sm bg-surface-soft animate-pulse" />
  }

  if (!session) {
    return (
      <Link
        href="/signin"
        className="h-10 px-3 flex items-center justify-center gap-2 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep"
      >
        <LogIn className="h-4 w-4" /> Log in
      </Link>
    )
  }

  const { name, email } = session.user

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full p-3 bg-surface-soft rounded-sm flex items-center gap-3 hover:bg-surface-card">
          <Avatar className="rounded-full bg-ink text-on-primary">
            <AvatarFallback className="rounded-full bg-ink text-on-primary text-xs font-bold">
              {initials(name || email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 text-left">
            <div className="text-sm font-medium truncate">{name || email}</div>
            <div className="text-[11px] text-mute truncate">{email}</div>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-56 rounded-sm border-hairline"
      >
        <DropdownMenuLabel className="text-[11px] uppercase tracking-widest text-mute truncate">
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
