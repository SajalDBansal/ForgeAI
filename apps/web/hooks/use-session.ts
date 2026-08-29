"use client"

import { useSyncExternalStore } from "react"

import { authClient } from "@/lib/auth-client"

const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function useSession() {
  const hydrated = useHydrated()
  const { data, isPending } = authClient.useSession()

  return {
    session: hydrated ? (data ?? null) : null,
    isPending: hydrated ? isPending : true,
  }
}
