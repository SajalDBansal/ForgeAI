"use client"

import { useEffect, useState } from "react"

/** Seconds to wait before an email can be re-sent. */
export const RESEND_COOLDOWN_SECONDS = 30

// Counts down once per second from the value passed to `setCooldown`.
// Used to throttle "resend email" buttons on the auth screens.
export function useResendCooldown(initial: number) {
  const [cooldown, setCooldown] = useState(initial)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(
      () => setCooldown((s) => Math.max(0, s - 1)),
      1000,
    )
    return () => clearInterval(timer)
  }, [cooldown])

  return [cooldown, setCooldown] as const
}
