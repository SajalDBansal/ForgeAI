import type { Sandbox } from "e2b"

import { connectPod } from "./connection.js"
import type { PodProcess, StartPodProcessOpts } from "../provider.js"

// Poll quickly while the server is starting (the build log matters), then slow down.
const POLL_FAST_MS = 2_000
const POLL_SLOW_MS = 8_000
const FAST_POLL_FOR_MS = 120_000

/** Consecutive failed polls before assuming the sandbox is gone. */
const MAX_CONSECUTIVE_POLL_FAILURES = 15

/** Where a detached process's output, pid and exit code are kept inside the sandbox. */
const RUN_DIR = "/tmp/forgeai-dev"

type PollResult = { alive: boolean; size: number; fresh: string }

// Wraps a string so the shell treats it as one literal argument.
// Used to embed the user's command and cwd safely in the launch script.
function singleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

// Resolves after `ms` milliseconds.
// Used between polls of a detached process.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Picks the next poll interval based on how long the process has been running.
// Keeps early build logs snappy without polling an idle server too often.
function pollInterval(startedAt: number): number {
  return Date.now() - startedAt < FAST_POLL_FOR_MS ? POLL_FAST_MS : POLL_SLOW_MS
}

// Builds the one-round-trip script that reports liveness, log size and new output.
// `offset` is the 1-based byte position to continue the log from.
function pollScript(pid: number, logPath: string, offset: number): string {
  return [
    `if kill -0 ${pid} 2>/dev/null; then echo ALIVE; else echo DEAD; fi`,
    `wc -c < ${logPath} 2>/dev/null || echo 0`,
    `tail -c +${offset} ${logPath} 2>/dev/null || true`,
  ].join("\n")
}

// Splits the poll script's output into liveness, log size and fresh output.
// Returns undefined when the output is incomplete, so the poll is simply retried.
function parsePollOutput(stdout: string): PollResult | undefined {
  const firstBreak = stdout.indexOf("\n")
  const secondBreak = stdout.indexOf("\n", firstBreak + 1)
  if (firstBreak === -1 || secondBreak === -1) return undefined

  return {
    alive: stdout.slice(0, firstBreak).trim() === "ALIVE",
    size: Number(stdout.slice(firstBreak + 1, secondBreak).trim()),
    fresh: stdout.slice(secondBreak + 1),
  }
}

// Reads the exit code the wrapper wrote when the process ended.
// Returns undefined if the file is missing (e.g. the sandbox went away).
async function readExitCode(
  sandbox: Sandbox,
  codePath: string,
): Promise<number | undefined> {
  const code = await sandbox.commands
    .run(`cat ${codePath} 2>/dev/null || true`)
    .then((r) => Number(r.stdout.trim()))
    .catch(() => NaN)
  return Number.isInteger(code) ? code : undefined
}

// Polls a detached process until it exits, streaming new log output as it goes.
// Polling is used because E2B's command streams time out and kill the process.
async function watch(
  sandbox: Sandbox,
  pid: number,
  logPath: string,
  codePath: string,
  opts: StartPodProcessOpts,
  killed: () => boolean,
): Promise<void> {
  const startedAt = Date.now()
  let offset = 1
  let failures = 0

  for (;;) {
    await sleep(pollInterval(startedAt))
    if (killed()) return

    let stdout: string
    try {
      stdout = (await sandbox.commands.run(pollScript(pid, logPath, offset)))
        .stdout
      failures = 0
    } catch {
      // A failed poll isn't proof of death; retry, but give up on a sandbox that never answers.
      failures += 1
      if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        opts.onExit(undefined)
        return
      }
      continue
    }

    if (killed()) return

    const poll = parsePollOutput(stdout)
    if (!poll) continue

    if (poll.fresh) opts.onOutput(poll.fresh)
    if (Number.isFinite(poll.size) && poll.size >= 0) offset = poll.size + 1

    if (!poll.alive) {
      opts.onExit(await readExitCode(sandbox, codePath))
      return
    }
  }
}

// Builds the shell script that launches a command detached via `nohup setsid`.
// The wrapper records its pid first and its exit code last, so both outlive our connection.
function launchScript(
  opts: StartPodProcessOpts,
  logPath: string,
  codePath: string,
  pidPath: string,
): string {
  const inner = `echo $$ > ${pidPath}; ${opts.command}; echo $? > ${codePath}`
  return [
    `mkdir -p ${RUN_DIR}`,
    `cd ${opts.cwd ? singleQuote(opts.cwd) : "."}`,
    `nohup setsid sh -c ${singleQuote(inner)} > ${logPath} 2>&1 &`,
    // Give the wrapper a moment to write its pid before reading it.
    `for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s ${pidPath} ] && break; sleep 0.1; done`,
    `cat ${pidPath} 2>/dev/null || echo 0`,
  ].join("\n")
}

// Starts a long-lived command (like a dev server) detached from our connection.
// Detaching avoids E2B killing background commands when their stream times out.
export async function startPodProcess(
  apiKey: string,
  sandboxId: string,
  opts: StartPodProcessOpts,
): Promise<PodProcess> {
  const sandbox = await connectPod(apiKey, sandboxId)

  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const logPath = `${RUN_DIR}/${runId}.log`
  const codePath = `${RUN_DIR}/${runId}.code`
  const pidPath = `${RUN_DIR}/${runId}.pid`

  // The detached process inherits the launch command's environment, so runtime env reaches it without a file.
  const started = await sandbox.commands.run(
    launchScript(opts, logPath, codePath, pidPath),
    {
      ...(opts.envs && { envs: opts.envs }),
    },
  )
  const pid = Number(started.stdout.trim().split("\n").pop())

  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(
      `Couldn't start the process: no pid (${started.stdout.trim().slice(0, 200)})`,
    )
  }

  let killed = false
  void watch(sandbox, pid, logPath, codePath, opts, () => killed)

  return {
    pid,
    async isAlive() {
      try {
        const result = await sandbox.commands.run(
          `kill -0 ${pid} 2>/dev/null && echo ALIVE || echo DEAD`,
        )
        return result.stdout.trim() === "ALIVE"
      } catch {
        // Can't tell: assume alive rather than replace something that may be fine.
        return true
      }
    },
    async kill() {
      killed = true
      // Negative pid = the whole process group. TERM first, then KILL.
      await sandbox.commands
        .run(
          `kill -TERM -- -${pid} 2>/dev/null; sleep 0.5; kill -KILL -- -${pid} 2>/dev/null; true`,
        )
        .catch(() => undefined)
    },
  }
}
