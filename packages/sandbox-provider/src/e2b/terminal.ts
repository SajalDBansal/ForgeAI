import { withPod } from "./connection.js"
import type { OpenPodTerminalOpts, PodTerminal } from "../provider.js"

// Opens an interactive PTY shell inside a sandbox.
// The only place the E2B PTY API is used; everything else works with PodTerminal.
export async function openPodTerminal(
  apiKey: string,
  sandboxId: string,
  opts: OpenPodTerminalOpts,
): Promise<PodTerminal> {
  // The handle is kept for this shell's later input, resize and kill.
  const { sandbox, handle } = await withPod(
    apiKey,
    sandboxId,
    async (sandbox) => ({
      sandbox,
      handle: await sandbox.pty.create({
        cols: opts.cols,
        rows: opts.rows,
        timeoutMs: opts.timeoutMs,
        ...(opts.cwd && { cwd: opts.cwd }),
        ...(opts.envs && { envs: opts.envs }),
        onData: opts.onData,
      }),
    }),
  )

  // Not awaited: this is only how we hear that the shell ended.
  void handle
    .wait()
    .then((result) => opts.onExit(result.exitCode))
    .catch(() => opts.onExit(undefined))

  const { pid } = handle
  return {
    pid,
    async write(data) {
      await sandbox.pty.sendInput(pid, new TextEncoder().encode(data))
    },
    async resize(size) {
      await sandbox.pty.resize(pid, size)
    },
    async kill() {
      await sandbox.pty.kill(pid)
    },
  }
}
