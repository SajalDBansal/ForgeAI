import {
  createSecretTextRedactor,
  PROJECT_ROOT,
  resolveProjectPath,
  SANDBOX_COMMAND_TIMEOUT_MS,
  SANDBOX_TRANSFER_TIMEOUT_S,
  snapshotArchiveCommand,
  snapshotFileListCommand,
  type GitAuthor,
  type GitCheckResult,
  type GitCommitResult,
  type GitRefusal,
  type GitRemote,
  type GitResolveResult,
  type ShiftChoice,
  type ShiftPick,
} from "@forgeAI/shared"
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir, devNull } from "node:os"
import { join } from "node:path"

import {
  CHECK,
  COMMIT_AND_PUSH,
  EXCLUDES,
  field,
  fields,
  parseCommits,
  parseNumstat,
  parseShift,
  PRELUDE,
  refusalFor,
  RESOLVE_KEEP_MINE,
  RESOLVE_TAKE_GITHUB,
  RESTORE,
  RESTORE_FILE,
} from "../lib/git-scripts.js"
import { ENV_CONFIG } from "../envConfig.js"
import { r2 } from "../lib/r2.js"
import { getPod, markProjectDirty } from "../state.js"
import { inCommitQueue } from "./commit.service.js"
import { requireProjectDocumentsFlushed } from "./document.service.js"
import {
  projectRetiringMessage,
  withActiveProjectWork,
} from "./active-work.service.js"
import { provider } from "../lib/provider.js"
import {
  unsafeTarEntries,
  unsafeTarLinkEntries,
} from "./privileged-git-workspace-core.js"

// Token-bearing Git runs in an orchestrator-owned temporary workspace, not in the project
// sandbox. The sandbox only exports/imports tar archives and token-free Git metadata.

const GIT_DIR = "/home/user/.forgeai/git"
const FOLDER = ENV_CONFIG.R2_SNAPSHOT_FOLDER_NAME
const EXPORT_FILE = "/tmp/forgeai/privileged-git-export.tar.gz"
const EXPORT_LIST = "/tmp/forgeai/privileged-git-export.list"
const IMPORT_FILE = "/tmp/forgeai/privileged-git-import.tar.gz"
const GIT_STATE_FILE = "/tmp/forgeai/privileged-git-state.tar.gz"
const TRANSFER_URL_TTL_SECONDS = 300

type CommandResult = { exitCode: number; stdout: string; stderr: string }

/** Whether each project's sandbox has git, once checked. */
const gitAvailable = new Map<string, boolean>()

// Returns whether the project's sandbox has git (undefined until checked).
// Lets git requests fail fast with a clear refusal.
export function hasGit(projectId: string): boolean | undefined {
  return gitAvailable.get(projectId)
}

// Forgets the git check for a project.
// Called when its pod goes away.
export function forgetGitState(projectId: string): void {
  gitAvailable.delete(projectId)
}

// Runs `git --version` in a new sandbox and remembers whether git is installed.
// Never throws; logs loudly when a template image lacks git.
export async function checkGitAvailable(
  projectId: string,
  sandboxId: string,
  templateId?: string,
): Promise<boolean> {
  let available = false
  let detail = ""
  try {
    const result = await provider.runPodCommand(sandboxId, "git --version", {
      timeoutMs: 15_000,
    })
    available =
      result.exitCode === 0 && /^git version /.test(result.stdout.trim())
    detail = (result.stdout || result.stderr).trim().slice(0, 200)
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error)
  }

  gitAvailable.set(projectId, available)
  if (!available) {
    console.error(
      `[git] ${projectId}: git is NOT installed in this sandbox${templateId ? ` (template ${templateId})` : ""}. ` +
        `Commits and rollbacks will not work until the template installs it — ` +
        `add .aptInstall(["git"]) to its image. Got: ${detail || "no output"}`,
    )
  }
  return available
}

export type GitOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; refusal: GitRefusal }
  | { ok: false; reason: "no_pod" }
  | { ok: false; reason: "failed"; detail: string }

// Builds the HTTP basic-auth header git uses to talk to GitHub with the token.
// Passed via env config so it never appears in the command or git config.
function basicAuth(token: string): string {
  return `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`
}

// Builds the environment every git script runs with: repo, branch, base, auth and author.
// `extra` carries per-script inputs like the commit message.
function gitEnvs(
  remote: GitRemote,
  extra: Record<string, string> = {},
  author?: GitAuthor,
): Record<string, string> {
  return {
    GIT_DIR,
    GIT_WORK_TREE: PROJECT_ROOT,
    GIT_TERMINAL_PROMPT: "0",
    // The token as an HTTP header for github.com only, for this command only.
    GIT_CONFIG_COUNT: "4",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: basicAuth(remote.token),
    // Non-ASCII paths come out as themselves, not octal escapes.
    GIT_CONFIG_KEY_1: "core.quotePath",
    GIT_CONFIG_VALUE_1: "false",
    // Repository hooks are untrusted project code; ForgeAI owns these Git operations.
    GIT_CONFIG_KEY_2: "core.hooksPath",
    GIT_CONFIG_VALUE_2: devNull,
    // Do not let repo config redirect fetches through local file transports.
    GIT_CONFIG_KEY_3: "protocol.file.allow",
    GIT_CONFIG_VALUE_3: "never",
    FORGEAI_REMOTE_URL: remote.cloneUrl,
    FORGEAI_BRANCH: remote.branch,
    FORGEAI_BASE: remote.lastKnownSha,
    FORGEAI_EXCLUDE: EXCLUDES,
    ...(author && {
      GIT_AUTHOR_NAME: author.name,
      GIT_AUTHOR_EMAIL: author.email,
      GIT_COMMITTER_NAME: author.name,
      GIT_COMMITTER_EMAIL: author.email,
    }),
    ...extra,
  }
}

function redactedGitResult(
  result: CommandResult,
  envs: Record<string, string>,
): CommandResult {
  const authHeader = envs.GIT_CONFIG_VALUE_0 ?? ""
  const encodedAuth = authHeader.match(/^AUTHORIZATION:\s+basic\s+(.+)$/i)?.[1]
  const redact = createSecretTextRedactor(
    [
      { key: "GITHUB_AUTH_HEADER", value: authHeader },
      encodedAuth && { key: "GITHUB_AUTH_HEADER", value: encodedAuth },
    ].filter((entry): entry is { key: string; value: string } =>
      Boolean(entry),
    ),
  )
  return {
    exitCode: result.exitCode,
    stdout: redact(result.stdout),
    stderr: redact(result.stderr),
  }
}

function tempKey(projectId: string, kind: string): string {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${FOLDER}/${projectId}/privileged-git/${kind}-${nonce}.tar.gz`
}

function commandDetail(result: CommandResult): string {
  return `exit ${result.exitCode}${result.stderr.trim() ? `: ${result.stderr.trim().slice(0, 300)}` : ""}`
}

function windowsGitShell(): string {
  const candidates = [
    "C:\\Program Files\\Git\\bin\\sh.exe",
    "C:\\Program Files (x86)\\Git\\bin\\sh.exe",
  ]

  return candidates.find((candidate) => existsSync(candidate)) ?? "sh"
}

function gitShell(): string {
  return process.platform === "win32" ? windowsGitShell() : "sh"
}

function gitShellPath(path: string): string {
  if (process.platform !== "win32") return path
  if (
    path === devNull ||
    path.toLowerCase() === "nul" ||
    path.toLowerCase() === "\\\\.\\nul"
  ) {
    return "/dev/null"
  }

  const normalized = path.replaceAll("\\", "/")
  const drive = normalized.match(/^([A-Za-z]):\/(.*)$/)
  return drive ? `/${drive[1]!.toLowerCase()}/${drive[2]}` : normalized
}

function exportScript(url: string): string {
  return [
    "set -e",
    `mkdir -p "$(dirname ${EXPORT_FILE})"`,
    `rm -f ${EXPORT_FILE} ${EXPORT_LIST}`,
    snapshotFileListCommand(PROJECT_ROOT, EXPORT_LIST),
    snapshotArchiveCommand(PROJECT_ROOT, EXPORT_LIST, EXPORT_FILE),
    `curl --fail -sS --max-time ${SANDBOX_TRANSFER_TIMEOUT_S} --upload-file ${EXPORT_FILE} '${url}'`,
    `rm -f ${EXPORT_FILE} ${EXPORT_LIST}`,
  ].join("\n")
}

function importScript(url: string): string {
  return [
    "set -e",
    `mkdir -p "$(dirname ${IMPORT_FILE})" ${PROJECT_ROOT}`,
    `curl --fail -sS --max-time ${SANDBOX_TRANSFER_TIMEOUT_S} '${url}' -o ${IMPORT_FILE}`,
    `tar -tzf ${IMPORT_FILE} >/dev/null`,
    `find ${PROJECT_ROOT} -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +`,
    `tar -xzf ${IMPORT_FILE} -C ${PROJECT_ROOT}`,
    `rm -f ${IMPORT_FILE}`,
  ].join("\n")
}

function gitStateImportScript(url: string): string {
  return [
    "set -e",
    `mkdir -p "$(dirname ${GIT_STATE_FILE})"`,
    `rm -rf ${GIT_DIR}`,
    `mkdir -p ${GIT_DIR}`,
    `curl --fail -sS --max-time ${SANDBOX_TRANSFER_TIMEOUT_S} '${url}' -o ${GIT_STATE_FILE}`,
    `tar -xzf ${GIT_STATE_FILE} -C ${GIT_DIR}`,
    `rm -f ${GIT_STATE_FILE}`,
  ].join("\n")
}

function localCommand(
  command: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string>; timeoutMs: number },
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: opts.timeoutMs,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ exitCode: 0, stdout, stderr })
          return
        }
        const detail = error as NodeJS.ErrnoException & {
          code?: number | string
          killed?: boolean
        }
        if (typeof detail.code === "number" || detail.killed) {
          resolve({
            exitCode: typeof detail.code === "number" ? detail.code : 124,
            stdout,
            stderr:
              stderr ||
              (detail.killed
                ? "privileged git command timed out"
                : detail.message),
          })
          return
        }
        reject(error)
      },
    )
  })
}

async function assertSafeTarArchive(archive: string, label: string) {
  const listed = await localCommand("tar", ["-tzf", archive], {
    timeoutMs: SANDBOX_COMMAND_TIMEOUT_MS.restore,
  })
  if (listed.exitCode !== 0) {
    throw new Error(`could not inspect ${label}: ${commandDetail(listed)}`)
  }
  const unsafe = unsafeTarEntries(listed.stdout)
  if (unsafe.length > 0) {
    throw new Error(
      `${label} contains unsafe archive paths: ${unsafe.slice(0, 5).join(", ")}`,
    )
  }

  const verbose = await localCommand("tar", ["-tvzf", archive], {
    timeoutMs: SANDBOX_COMMAND_TIMEOUT_MS.restore,
  })
  if (verbose.exitCode !== 0) {
    throw new Error(`could not inspect ${label}: ${commandDetail(verbose)}`)
  }
  const links = unsafeTarLinkEntries(verbose.stdout)
  if (links.length > 0) {
    throw new Error(
      `${label} contains unsupported archive links: ${links.slice(0, 5).join(", ")}`,
    )
  }
}

async function exportSandboxSource(
  projectId: string,
  sandboxId: string,
  worktree: string,
): Promise<string> {
  const key = tempKey(projectId, "source-export")
  try {
    const url = await r2.signUploadUrl(key, TRANSFER_URL_TTL_SECONDS)
    const exported = await provider.runPodCommand(
      sandboxId,
      exportScript(url),
      {
        timeoutMs: SANDBOX_COMMAND_TIMEOUT_MS.snapshot,
      },
    )
    if (exported.exitCode !== 0) {
      throw new Error(
        `could not export sandbox source: ${commandDetail(exported)}`,
      )
    }

    const archive = join(worktree, "..", "source.tar.gz")
    await writeFile(archive, await r2.downloadObject(key))
    await assertSafeTarArchive(archive, "sandbox source export")
    const extracted = await localCommand(
      "tar",
      ["-xzf", archive, "-C", worktree],
      {
        timeoutMs: SANDBOX_COMMAND_TIMEOUT_MS.restore,
      },
    )
    if (extracted.exitCode !== 0) {
      throw new Error(
        `could not unpack sandbox source: ${commandDetail(extracted)}`,
      )
    }
    return archive
  } finally {
    await r2.deleteObject(key).catch(() => undefined)
  }
}

async function uploadLocalArchive(
  projectId: string,
  kind: string,
  sourceDir: string,
): Promise<string> {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const archive = join(tmpdir(), `forgeai-${kind}-${nonce}.tar.gz`)
  const packed = await localCommand(
    "tar",
    ["-czf", archive, "-C", sourceDir, "."],
    { timeoutMs: SANDBOX_COMMAND_TIMEOUT_MS.snapshot },
  )
  if (packed.exitCode !== 0) {
    throw new Error(`could not pack ${kind}: ${commandDetail(packed)}`)
  }
  await assertSafeTarArchive(archive, kind)
  const key = tempKey(projectId, kind)
  try {
    await r2.uploadObject(key, await readFile(archive), "application/gzip", {
      purpose: `privileged-git-${kind}`,
    })
    return key
  } finally {
    await rm(archive, { force: true }).catch(() => undefined)
  }
}

async function importTrustedSource(
  projectId: string,
  sandboxId: string,
  worktree: string,
): Promise<void> {
  const key = await uploadLocalArchive(projectId, "source-import", worktree)
  try {
    const url = await r2.signDownloadUrl(
      key,
      "workspace.tar.gz",
      TRANSFER_URL_TTL_SECONDS,
    )
    const imported = await provider.runPodCommand(
      sandboxId,
      importScript(url),
      {
        timeoutMs: SANDBOX_COMMAND_TIMEOUT_MS.restore,
      },
    )
    if (imported.exitCode !== 0) {
      throw new Error(
        `could not import trusted git result: ${commandDetail(imported)}`,
      )
    }
  } finally {
    await r2.deleteObject(key).catch(() => undefined)
  }
}

async function syncGitState(
  projectId: string,
  sandboxId: string,
  gitDir: string,
): Promise<void> {
  const key = await uploadLocalArchive(projectId, "git-state", gitDir)
  try {
    const url = await r2.signDownloadUrl(
      key,
      "git-state.tar.gz",
      TRANSFER_URL_TTL_SECONDS,
    )
    const imported = await provider.runPodCommand(
      sandboxId,
      gitStateImportScript(url),
      { timeoutMs: SANDBOX_COMMAND_TIMEOUT_MS.restore },
    )
    if (imported.exitCode !== 0) {
      throw new Error(
        `could not sync token-free git state: ${commandDetail(imported)}`,
      )
    }
  } finally {
    await r2.deleteObject(key).catch(() => undefined)
  }
}

async function runPrivilegedGit(
  projectId: string,
  script: string,
  envs: Record<string, string>,
  { importSource = false }: { importSource?: boolean } = {},
): Promise<CommandResult | { noPod: true }> {
  const pod = getPod(projectId)
  if (!pod) return { noPod: true }

  const root = await mkdtemp(join(tmpdir(), "forgeai-git-"))
  const worktree = join(root, "worktree")
  const gitDir = join(root, "git")
  const home = join(root, "home")
  await Promise.all([
    mkdir(worktree, { recursive: true }),
    mkdir(gitDir, { recursive: true }),
    mkdir(home, { recursive: true }),
  ])

  try {
    await exportSandboxSource(projectId, pod.sandboxId, worktree)
    const hostEnvs = {
      ...envs,
      GIT_DIR: gitShellPath(gitDir),
      GIT_WORK_TREE: gitShellPath(worktree),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: gitShellPath(devNull),
      GIT_CONFIG_VALUE_2: gitShellPath(devNull),
      HOME: gitShellPath(home),
      XDG_CONFIG_HOME: gitShellPath(home),
    }
    const result = redactedGitResult(
      await localCommand(gitShell(), ["-c", script], {
        cwd: worktree,
        env: hostEnvs,
        timeoutMs: SANDBOX_COMMAND_TIMEOUT_MS.git,
      }),
      hostEnvs,
    )

    if (result.exitCode === 0) {
      await syncGitState(projectId, pod.sandboxId, gitDir)
      if (importSource)
        await importTrustedSource(projectId, pod.sandboxId, worktree)
    }
    return result
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

// Turns a failed script into a known refusal, or a generic failure with stderr.
// Shared by every git operation's error path.
function failure<T>(result: CommandResult): GitOutcome<T> {
  const refusal = refusalFor(result.exitCode, result.stdout, result.stderr)
  return refusal
    ? { ok: false, refusal }
    : {
        ok: false,
        reason: "failed",
        detail: result.stderr.trim().slice(0, 300),
      }
}

function gitFailure<T>(error: unknown): GitOutcome<T> {
  return {
    ok: false,
    reason: "failed",
    detail:
      projectRetiringMessage(error) ??
      (error instanceof Error ? error.message : String(error)),
  }
}

// Builds token-free Git state and checks GitHub, returning GitHub's head (or the shift found).
// Run right after a sandbox starts so the first commit doesn't wait on a clone.
export function prepareGit(
  projectId: string,
  remote: GitRemote,
): Promise<GitOutcome<{ githubHead: string }>> {
  return withActiveProjectWork<GitOutcome<{ githubHead: string }>>(
    projectId,
    "git",
    "git prepare",
    () =>
      inCommitQueue(projectId, async () => {
        const result = await runPrivilegedGit(
          projectId,
          PRELUDE,
          gitEnvs(remote),
        )
        if ("noPod" in result) return { ok: false, reason: "no_pod" }
        if (result.exitCode === 0)
          return {
            ok: true,
            data: {
              githubHead:
                field(result.stdout, "GITHUB_HEAD") ?? remote.lastKnownSha,
            },
          }
        return failure(result)
      }),
  ).catch((error) => gitFailure<{ githubHead: string }>(error))
}

// Parses a commit-and-push script's output into the commit's sha and per-file stats.
// Returns an "unchanged" refusal when there was nothing to commit.
function commitResult(result: CommandResult): GitOutcome<GitCommitResult> {
  if (result.exitCode !== 0) return failure(result)
  if (/^UNCHANGED=1$/m.test(result.stdout))
    return { ok: false, refusal: { reason: "unchanged" } }

  const sha = field(result.stdout, "SHA")
  if (!sha || !/^PUSHED=1$/m.test(result.stdout)) {
    return { ok: false, reason: "failed", detail: "git gave no commit id" }
  }
  const files = parseNumstat(result.stdout)
  return {
    ok: true,
    data: {
      sha,
      files,
      additions: files.reduce((sum, f) => sum + f.additions, 0),
      deletions: files.reduce((sum, f) => sum + f.deletions, 0),
    },
  }
}

// Commits everything in the project and pushes it to GitHub.
// Open editors are flushed first so the commit matches what people see.
export function commitGit(
  projectId: string,
  remote: GitRemote,
  message: string,
  author: GitAuthor,
): Promise<GitOutcome<GitCommitResult>> {
  return withActiveProjectWork<GitOutcome<GitCommitResult>>(
    projectId,
    "git",
    "git commit",
    () =>
      inCommitQueue(projectId, async () => {
        if (!getPod(projectId)) return { ok: false, reason: "no_pod" }
        await requireProjectDocumentsFlushed(projectId)
        const result = await runPrivilegedGit(
          projectId,
          PRELUDE + COMMIT_AND_PUSH,
          gitEnvs(remote, { FORGEAI_MESSAGE: message }, author),
        )
        if ("noPod" in result) return { ok: false, reason: "no_pod" }
        return commitResult(result)
      }),
  ).catch((error) => gitFailure<GitCommitResult>(error))
}

// Restores the project to commit `sha` in the helper and commits that as a new entry.
// History only grows; files are marked dirty after the successful import rewrites them.
export function rollbackGit(
  projectId: string,
  remote: GitRemote,
  sha: string,
  message: string,
  author: GitAuthor,
): Promise<GitOutcome<GitCommitResult>> {
  return withActiveProjectWork<GitOutcome<GitCommitResult>>(
    projectId,
    "git",
    "git rollback",
    () =>
      inCommitQueue(projectId, async () => {
        if (!getPod(projectId)) return { ok: false, reason: "no_pod" }
        await requireProjectDocumentsFlushed(projectId)
        const result = await runPrivilegedGit(
          projectId,
          PRELUDE + RESTORE + COMMIT_AND_PUSH,
          gitEnvs(
            remote,
            { FORGEAI_MESSAGE: message, FORGEAI_TARGET: sha },
            author,
          ),
          { importSource: true },
        )
        if ("noPod" in result) return { ok: false, reason: "no_pod" }
        if (result.exitCode === 0) markProjectDirty(projectId)
        return commitResult(result)
      }),
  ).catch((error) => gitFailure<GitCommitResult>(error))
}

// Reports where GitHub stands and, if it moved, what came in and what it clashes with.
// Read-only: changes no file.
export function checkGit(
  projectId: string,
  remote: GitRemote,
): Promise<GitOutcome<GitCheckResult>> {
  return withActiveProjectWork<GitOutcome<GitCheckResult>>(
    projectId,
    "git",
    "git check",
    () =>
      inCommitQueue(
        projectId,
        async (): Promise<GitOutcome<GitCheckResult>> => {
          const result = await runPrivilegedGit(
            projectId,
            CHECK,
            gitEnvs(remote),
          )
          if ("noPod" in result) return { ok: false, reason: "no_pod" }
          if (result.exitCode !== 0) return failure(result)
          if (field(result.stdout, "STATE") === "same") {
            return {
              ok: true,
              data: {
                state: "same",
                githubHead:
                  field(result.stdout, "GITHUB_HEAD") ?? remote.lastKnownSha,
              },
            }
          }
          return {
            ok: true,
            data: { state: "shift", ...parseShift(result.stdout) },
          }
        },
      ),
  ).catch((error) => gitFailure<GitCheckResult>(error))
}

// Builds the script inputs for resolving a shift.
// Only "keep mine" picks are sent; everything else defaults to GitHub's version.
function resolveInputs(
  choice: ShiftChoice,
  expectHead: string,
  picks: ShiftPick[],
  message?: string,
): Record<string, string> {
  return {
    FORGEAI_CHOICE: choice,
    FORGEAI_EXPECT: expectHead,
    FORGEAI_PICKS: picks
      .filter((p) => p.keep === "mine")
      .map((p) => `mine\t${p.path}`)
      .join("\n"),
    ...(message && { FORGEAI_MESSAGE: message }),
  }
}

// Parses a resolve script's output into what was replaced, kept, merged and brought in.
// Also includes the new commit when the choice was "mine".
function resolveResult(
  result: CommandResult,
  choice: ShiftChoice,
  expectHead: string,
): GitOutcome<GitResolveResult> {
  let commit: GitCommitResult | undefined
  if (choice === "mine" && /^SHA=/m.test(result.stdout)) {
    const committed = commitResult(result)
    if (!committed.ok) return committed
    commit = committed.data
  }
  return {
    ok: true,
    data: {
      newBase: field(result.stdout, "NEW_BASE") ?? expectHead,
      backup: field(result.stdout, "BACKUP") ?? "",
      replaced: fields(result.stdout, "REPLACED"),
      kept: fields(result.stdout, "KEPT"),
      merged: fields(result.stdout, "MERGED"),
      commits: parseCommits(result.stdout),
      ...(commit && { commit }),
    },
  }
}

// Resolves a GitHub shift the way the person chose, after saving a backup commit.
// `author` is who the backup (and, for "mine", the new commit) is made as.
export function resolveGit(
  projectId: string,
  remote: GitRemote,
  choice: ShiftChoice,
  expectHead: string,
  picks: ShiftPick[],
  author: GitAuthor,
  message?: string,
): Promise<GitOutcome<GitResolveResult>> {
  return withActiveProjectWork<GitOutcome<GitResolveResult>>(
    projectId,
    "git",
    "git resolve",
    () =>
      inCommitQueue(
        projectId,
        async (): Promise<GitOutcome<GitResolveResult>> => {
          if (!getPod(projectId)) return { ok: false, reason: "no_pod" }
          await requireProjectDocumentsFlushed(projectId)

          const script =
            choice === "mine"
              ? RESOLVE_KEEP_MINE + COMMIT_AND_PUSH
              : RESOLVE_TAKE_GITHUB
          const envs = gitEnvs(
            remote,
            resolveInputs(choice, expectHead, picks, message),
            author,
          )
          const result = await runPrivilegedGit(projectId, script, envs, {
            importSource: choice !== "mine",
          })
          if ("noPod" in result) return { ok: false, reason: "no_pod" }
          // Taking GitHub's changes rewrote files.
          if (choice !== "mine" && result.exitCode === 0)
            markProjectDirty(projectId)
          if (result.exitCode !== 0) return failure(result)

          return resolveResult(result, choice, expectHead)
        },
      ),
  ).catch((error) => gitFailure<GitResolveResult>(error))
}

// Puts one file back as it was in a shift's backup commit, as an uncommitted change.
// Backs "Restore my version"; the path is checked to be inside the project first.
export function restoreFileGit(
  projectId: string,
  backup: string,
  path: string,
): Promise<GitOutcome<{ path: string }>> {
  return withActiveProjectWork<GitOutcome<{ path: string }>>(
    projectId,
    "git",
    "git restore file",
    () =>
      inCommitQueue(
        projectId,
        async (): Promise<GitOutcome<{ path: string }>> => {
          const relative = resolveProjectPath(path)
          if (!relative)
            return {
              ok: false,
              reason: "failed",
              detail: "That path is outside the project",
            }
          const pod = getPod(projectId)
          if (!pod) return { ok: false, reason: "no_pod" }
          const result = await provider.runPodCommand(
            pod.sandboxId,
            RESTORE_FILE,
            {
              timeoutMs: SANDBOX_COMMAND_TIMEOUT_MS.quick,
              cwd: "/",
              envs: {
                GIT_DIR,
                GIT_WORK_TREE: PROJECT_ROOT,
                FORGEAI_BACKUP: backup,
                FORGEAI_PATH: relative,
              },
            },
          )
          if (result.exitCode !== 0) return failure(result)
          markProjectDirty(projectId)
          return { ok: true, data: { path: relative } }
        },
      ),
  ).catch((error) => gitFailure<{ path: string }>(error))
}
