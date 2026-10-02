import { publishSandboxEvent } from "../lib/redis.js"

// What the shared shell prints, on its way to the tabs: batched into one message every 16 ms,
// and the last 64 KB kept so a tab that joins late starts with recent output, not a blank screen.

/** How long output is collected before it's published; one message instead of hundreds per second. */
const OUTPUT_BATCH_MS = 16

/** A batch this big is published at once rather than waiting out the timer. */
const OUTPUT_BATCH_MAX_BYTES = 32 * 1024

/** Recent output kept per shell, sent to a tab that joins late so it doesn't start blank. */
const HISTORY_MAX_BYTES = 64 * 1024

interface OutputBuffer {
  /** Output not yet published. */
  pending: Uint8Array[]
  pendingBytes: number
  timer?: ReturnType<typeof setTimeout>
  /** The last HISTORY_MAX_BYTES of published output. */
  history: Buffer
}

/** Batching and recent output, per project shell. */
const outputs = new Map<string, OutputBuffer>()

// Publishes the project's pending output as one message and adds it to the recent history.
// Called by the batch timer, before an exit, and before history is sent to a late joiner.
export function flushOutput(projectId: string): void {
  const output = outputs.get(projectId)
  if (!output || output.pendingBytes === 0) return

  clearTimeout(output.timer)
  output.timer = undefined
  const batch = Buffer.concat(output.pending)
  output.pending = []
  output.pendingBytes = 0

  const history = Buffer.concat([output.history, batch])
  output.history =
    history.length > HISTORY_MAX_BYTES
      ? history.subarray(history.length - HISTORY_MAX_BYTES)
      : history

  // Base64 because a batch can end mid-character; xterm reassembles it.
  publishSandboxEvent({
    type: "terminal.output",
    projectId,
    data: batch.toString("base64"),
  })
}

// Collects a chunk of shell output, publishing it after OUTPUT_BATCH_MS (or at once when big).
// npm install prints thousands of tiny chunks; one Redis message each floods every hop.
export function queueOutput(projectId: string, chunk: Uint8Array): void {
  let output = outputs.get(projectId)
  if (!output) {
    output = { pending: [], pendingBytes: 0, history: Buffer.alloc(0) }
    outputs.set(projectId, output)
  }

  // Copied: the PTY may reuse the chunk's memory after this callback returns.
  output.pending.push(Buffer.from(chunk))
  output.pendingBytes += chunk.byteLength

  if (output.pendingBytes >= OUTPUT_BATCH_MAX_BYTES) flushOutput(projectId)
  else
    output.timer ??= setTimeout(() => flushOutput(projectId), OUTPUT_BATCH_MS)
}

// Returns the recent output to replay for a joining tab, starting at a line boundary.
// Cutting mid-line (or mid-character) would show a garbled first line.
export function recentOutput(projectId: string): Buffer {
  flushOutput(projectId)
  const history = outputs.get(projectId)?.history ?? Buffer.alloc(0)
  if (history.length < HISTORY_MAX_BYTES) return history
  const lineStart = history.indexOf(0x0a)
  return lineStart < 0 ? history : history.subarray(lineStart + 1)
}

// Drops a shell's pending output and history.
// Called when the shell ends, so a new shell starts with a clean screen for late joiners.
export function forgetOutput(projectId: string): void {
  const output = outputs.get(projectId)
  if (output) clearTimeout(output.timer)
  outputs.delete(projectId)
}
