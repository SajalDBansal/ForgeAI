"use client"

import { useSyncExternalStore } from "react"

import { authClient } from "@/lib/auth-client"

// No-op store subscription: hydration state never changes after mount.
const subscribe = () => () => {}
// Client snapshot: hydrated.
const getSnapshot = () => true
// Server snapshot: not hydrated.
const getServerSnapshot = () => false

// Returns false during SSR and true once the client has hydrated.
// Avoids hydration mismatches for client-only values like the session.
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// Returns the better-auth session, treated as pending until hydration.
// The standard way components read who is signed in.
export function useSession() {
  const hydrated = useHydrated()
  const { data, isPending } = authClient.useSession()

  return {
    session: hydrated ? (data ?? null) : null,
    isPending: hydrated ? isPending : true,
  }
}
