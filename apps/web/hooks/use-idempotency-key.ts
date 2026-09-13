"use client"

import { useCallback, useMemo, useRef } from "react"

// Makes a random key, with a fallback for browsers where crypto.randomUUID isn't available (plain http).
// Only needs to be unique per user action, not secret.
function newKey(): string {
  return (
    crypto.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}

// Holds one Idempotency-Key per user action, so the API can recognise a resubmitted request
// (double click, timed-out retry) and reply with the first result instead of doing it twice.
// The key is reused while the same request is retried and replaced once it succeeds or its input changes.
export function useIdempotencyKey() {
  const current = useRef<{ key: string; fingerprint: string } | null>(null)

  // Returns the key for a request; `fingerprint` describes its input so different input never reuses a key.
  const key = useCallback((fingerprint: string) => {
    if (current.current?.fingerprint !== fingerprint)
      current.current = { key: newKey(), fingerprint }
    return current.current.key
  }, [])

  // Drops the key so the next action starts fresh. Call it after the request succeeds.
  const renew = useCallback(() => {
    current.current = null
  }, [])

  // Stable object, so it can sit in hook dependency lists without re-creating callbacks.
  return useMemo(() => ({ key, renew }), [key, renew])
}
