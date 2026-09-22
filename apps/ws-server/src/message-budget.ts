// How much one tab may send over its socket each second. Everything a tab sends goes on to
// the one orchestrator every project shares, so a tab stuck in a loop (most likely our own bug)
// must not slow everyone else down. Normal use is far below this: fast typing is ~15 messages a
// second, and a paste is one message.

/** Messages per second: over 10× fast typing. */
const MAX_MESSAGES_PER_SECOND = 200

/** Characters per second, summed over each message's text fields: room for two of the largest pastes. */
const MAX_CHARS_PER_SECOND = 5_000_000

// Adds up a message's top-level text fields (a doc.update's `update`, a terminal's `data`, ...).
// Cheap, and runs before validation so invalid messages count too.
function payloadChars(payload: unknown): number {
  if (!payload || typeof payload !== "object") return 0
  let chars = 0
  for (const value of Object.values(payload))
    if (typeof value === "string") chars += value.length
  return chars
}

// Creates one socket's budget. Call the returned function for each message it sends; it returns
// false once the socket has gone over budget in the current one-second window.
export function createMessageBudget(): (payload: unknown) => boolean {
  let windowStart = Date.now()
  let messages = 0
  let chars = 0

  return (payload) => {
    const now = Date.now()
    if (now - windowStart >= 1_000) {
      windowStart = now
      messages = 0
      chars = 0
    }
    messages += 1
    chars += payloadChars(payload)
    return messages <= MAX_MESSAGES_PER_SECOND && chars <= MAX_CHARS_PER_SECOND
  }
}
