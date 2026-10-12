import { randomUUID } from "node:crypto"
import {
  COMMAND_TIMED_OUT_EXIT_CODE,
  type PodProcess,
} from "@forgeAI/sandbox-provider"
import {
  PROJECT_ROOT,
  SANDBOX_COMMAND_TIMEOUT_MS,
  SANDBOX_TRANSFER_TIMEOUT_S,
  agentCheckpointArtifactKey,
  createSecretStreamRedactor,
  resolveProjectPath,
  type AgentCheckpointArtifact,
  type AgentCheckpointDataType,
  type AgentCheckpointDiffDataType,
  type AgentCheckpointDiffResult,
  type AgentCheckpointRestoreDataType,
  type AgentCheckpointRestoreResult,
  type AgentCheckpointResult,
  type AgentEditFileDataType,
  type AgentEditFileResult,
  type AgentExecDataType,
  type AgentExecResult,
  type AgentSearchMatch,
  type AgentSearchQuery,
  type AgentSearchResult,
} from "@forgeAI/shared"

import { publishAgentEvent } from "../lib/redis.js"
import { getPod, getProjectSecrets, markProjectDirty } from "../state.js"
import { provider } from "../lib/provider.js"
import { touchPod } from "./activity.service.js"
import {
  editFileForAgent,
  requireProjectDocumentsFlushed,
  resetOpenDocuments,
} from "./document.service.js"
import {
  projectRetiringMessage,
  withActiveProjectWork,
} from "./active-work.service.js"
import { EXCLUDES } from "../lib/git-scripts.js"
import {
  CHECKPOINT_DIFF_COMMAND,
  CHECKPOINT_UNDO_CONFLICT_EXIT_CODE,
  checkpointUndoCommand,
  parseCheckpointUndoConflicts,
  parseCheckpointDiff,
} from "../lib/checkpoint-diff.js"
import { inCommitQueue } from "./commit.service.js"
import { ENV_CONFIG } from "../envConfig.js"
import { r2 } from "../lib/r2.js"
import {
  projectSecretEnvFor,
  projectSecretRedactions,
} from "./runtime-secret-policy.js"

type AgentToolOutcome<T> =
  | { ok: true; data: T }
  | {
      ok: false
      reason: "no_pod" | "not_found" | "failed" | "conflict" | "search_missing"
      detail?: string
    }

const EXEC_OUTPUT_CHARS = 12_000
const LIVE_CHUNK_CHARS = 4_000
const SEARCH_TIMEOUT_MS = 15_000
const CHECKPOINT_TIMEOUT_MS = SANDBOX_COMMAND_TIMEOUT_MS.snapshot
const RESTORE_TIMEOUT_MS = SANDBOX_COMMAND_TIMEOUT_MS.commit
const CHECKPOINT_URL_TTL_SECONDS = 600
const CHECKPOINT_BUNDLE_DIR = "/tmp/forgeai/checkpoints"
const CHECKPOINT_FOLDER = ENV_CONFIG.R2_SNAPSHOT_FOLDER_NAME

function retirementOutcome<T>(error: unknown): AgentToolOutcome<T> | undefined {
  const detail = projectRetiringMessage(error)
  return detail ? { ok: false, reason: "conflict", detail } : undefined
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function outputField(stdout: string, name: string): string | undefined {
  return stdout.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1]?.trim()
}

function checkpointArtifact(
  projectId: string,
  runId: string,
  seq: number,
): { key: string; stagedKey: string } {
  const key = agentCheckpointArtifactKey(
    CHECKPOINT_FOLDER,
    projectId,
    runId,
    seq,
  )
  return { key, stagedKey: `${key}.staged` }
}

function checkpointCommand(): string {
  return [
    "set -e",
    "command -v git >/dev/null 2>&1 || { echo 'git not found' >&2; exit 127; }",
    "command -v sha256sum >/dev/null 2>&1 || { echo 'sha256sum not found' >&2; exit 127; }",
    "git init -q",
    "mkdir -p .git/info",
    'printf "%s\\n" "$FORGEAI_GIT_EXCLUDE" > .git/info/exclude',
    "git config user.name 'ForgeAI Agent'",
    "git config user.email 'agent@forgeai.local'",
    "git add -A",
    'git commit --allow-empty -q -m "$FORGEAI_CHECKPOINT_MESSAGE"',
    "commit=$(git rev-parse HEAD)",
    'ref="refs/forgeai/checkpoints/$commit"',
    'mkdir -p "$(dirname "$FORGEAI_CHECKPOINT_BUNDLE")"',
    'rm -f "$FORGEAI_CHECKPOINT_BUNDLE"',
    'git update-ref "$ref" "$commit"',
    'git bundle create "$FORGEAI_CHECKPOINT_BUNDLE" "$ref"',
    "sha=$(sha256sum \"$FORGEAI_CHECKPOINT_BUNDLE\" | awk '{print $1}')",
    'bytes=$(wc -c < "$FORGEAI_CHECKPOINT_BUNDLE" | tr -d " ")',
    `curl --fail -sS --max-time ${SANDBOX_TRANSFER_TIMEOUT_S} --upload-file "$FORGEAI_CHECKPOINT_BUNDLE" "$FORGEAI_CHECKPOINT_UPLOAD_URL"`,
    'rm -f "$FORGEAI_CHECKPOINT_BUNDLE"',
    'printf "FORGEAI_COMMIT=%s\\nFORGEAI_BUNDLE_SHA256=%s\\nFORGEAI_BUNDLE_BYTES=%s\\n" "$commit" "$sha" "$bytes"',
  ].join("\n")
}

async function promoteCheckpointArtifact(
  stagedKey: string,
  key: string,
  projectId: string,
  runId: string,
  seq: number,
  commit: string,
  artifact: AgentCheckpointArtifact,
): Promise<AgentCheckpointArtifact> {
  const staged = await r2.headObject(stagedKey)
  if (!staged || staged.size === 0) {
    throw new Error("Checkpoint bundle was not uploaded.")
  }
  if (staged.size !== artifact.bytes) {
    throw new Error("Checkpoint bundle size did not match the sandbox output.")
  }

  await r2.copyObject(stagedKey, key, {
    projectid: projectId,
    runid: runId,
    seq: String(seq),
    commit,
    sha256: artifact.sha256,
    bytes: String(artifact.bytes),
  })
  await r2.deleteObject(stagedKey).catch(() => undefined)
  return artifact
}

async function verifyCheckpointArtifact(
  artifact: AgentCheckpointArtifact,
  commit: string,
): Promise<void> {
  const head = await r2.headObject(artifact.key)
  if (!head || head.size === 0)
    throw new Error("Checkpoint artifact is missing.")
  if (head.size !== artifact.bytes)
    throw new Error("Checkpoint artifact size does not match its record.")
  if (head.metadata.sha256 && head.metadata.sha256 !== artifact.sha256)
    throw new Error(
      "Checkpoint artifact hash metadata does not match its record.",
    )
  if (head.metadata.commit && head.metadata.commit !== commit)
    throw new Error(
      "Checkpoint artifact commit metadata does not match its record.",
    )
}

function checkpointImportCommand(): string {
  return [
    "set -e",
    "command -v git >/dev/null 2>&1 || { echo 'git not found' >&2; exit 127; }",
    "command -v sha256sum >/dev/null 2>&1 || { echo 'sha256sum not found' >&2; exit 127; }",
    'mkdir -p "$FORGEAI_CHECKPOINT_IMPORT_DIR"',
    "import_checkpoint() {",
    '  commit="$1"',
    '  url="$2"',
    '  sha="$3"',
    '  file="$4"',
    '  if git cat-file -e "$commit^{commit}" 2>/dev/null; then',
    "    return 0",
    "  fi",
    `  curl --fail -sS --max-time ${SANDBOX_TRANSFER_TIMEOUT_S} "$url" -o "$file"`,
    "  actual=$(sha256sum \"$file\" | awk '{print $1}')",
    '  if [ "$actual" != "$sha" ]; then',
    '    echo "checkpoint bundle hash mismatch for $commit" >&2',
    "    exit 65",
    "  fi",
    '  ref="refs/forgeai/checkpoints/$commit"',
    '  git bundle verify "$file" >/dev/null',
    '  git fetch -q "$file" "$ref:$ref"',
    '  git cat-file -e "$commit^{commit}"',
    '  rm -f "$file"',
    "}",
    'import_checkpoint "$FORGEAI_BEFORE_COMMIT" "$FORGEAI_BEFORE_BUNDLE_URL" "$FORGEAI_BEFORE_BUNDLE_SHA256" "$FORGEAI_CHECKPOINT_IMPORT_DIR/before.bundle"',
    'import_checkpoint "$FORGEAI_AFTER_COMMIT" "$FORGEAI_AFTER_BUNDLE_URL" "$FORGEAI_AFTER_BUNDLE_SHA256" "$FORGEAI_CHECKPOINT_IMPORT_DIR/after.bundle"',
  ].join("\n")
}

function publishOutput(
  projectId: string,
  runId: string,
  seq: number,
  text: string,
): void {
  if (!text) return

  for (let at = 0; at < text.length; at += LIVE_CHUNK_CHARS) {
    publishAgentEvent(projectId, {
      type: "tool.output",
      runId,
      seq,
      chunk: text.slice(at, at + LIVE_CHUNK_CHARS),
    })
  }
}

async function runLiveCommand(
  projectId: string,
  sandboxId: string,
  input: AgentExecDataType,
  cwd: string,
  signal?: AbortSignal,
): Promise<AgentExecResult> {
  const started = Date.now()
  let process: PodProcess | undefined
  let output = ""
  let truncated = false
  let settled = false
  const secrets = getProjectSecrets(projectId)
  const envs = projectSecretEnvFor("agent-command", secrets)
  const redactor = createSecretStreamRedactor(projectSecretRedactions(secrets))

  // Cap only after redaction so truncating a value cannot expose part of a secret.
  const emitOutput = (text: string) => {
    if (truncated || !text) return
    const remaining = EXEC_OUTPUT_CHARS - output.length
    const kept = text.slice(0, remaining)
    output += kept
    truncated = text.length > remaining
    publishOutput(
      projectId,
      input.runId,
      input.seq,
      kept + (truncated ? "\n...[truncated output]" : ""),
    )
  }

  return new Promise((resolve, reject) => {
    const finish = (exitCode: number, timedOut: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abort)
      emitOutput(redactor.flush())

      resolve({
        exitCode,
        stdout: truncated ? `${output}\n...[truncated output]` : output,
        stderr: "",
        durationMs: Date.now() - started,
        timedOut,
      })
    }

    const stopProcess = () => {
      void process?.kill()
    }

    const abort = () => {
      stopProcess()
      finish(130, false)
    }

    const timeout = setTimeout(() => {
      stopProcess()
      finish(COMMAND_TIMED_OUT_EXIT_CODE, true)
    }, input.timeoutMs)

    signal?.addEventListener("abort", abort, { once: true })

    provider
      .startPodProcess(sandboxId, {
        command: input.command,
        cwd,
        ...(envs && { envs }),
        onOutput(chunk) {
          if (!settled && !truncated) emitOutput(redactor.push(chunk))
        },
        onExit(exitCode) {
          finish(exitCode ?? 1, false)
        },
      })
      .then((startedProcess) => {
        if (settled) {
          void startedProcess.kill()
          return
        }
        process = startedProcess
        if (signal?.aborted) abort()
      })
      .catch((error: unknown) => {
        clearTimeout(timeout)
        signal?.removeEventListener("abort", abort)
        reject(error)
      })
  })
}

export async function agentExec(
  projectId: string,
  input: AgentExecDataType,
  signal?: AbortSignal,
): Promise<AgentToolOutcome<AgentExecResult>> {
  try {
    return await withActiveProjectWork(
      projectId,
      "agent",
      "agent exec",
      async () => {
        const pod = getPod(projectId)
        if (!pod) return { ok: false, reason: "no_pod" }

        const cwd = resolveProjectPath(input.cwd ?? PROJECT_ROOT)
        if (!cwd)
          return {
            ok: false,
            reason: "not_found",
            detail: "Working directory is outside the project.",
          }

        touchPod(projectId)
        const result = await runLiveCommand(
          projectId,
          pod.sandboxId,
          input,
          cwd,
          signal,
        )
        markProjectDirty(projectId)

        return { ok: true, data: result }
      },
    )
  } catch (error) {
    const retirement = retirementOutcome<AgentExecResult>(error)
    if (retirement) return retirement
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function agentEditFile(
  projectId: string,
  input: AgentEditFileDataType,
): Promise<AgentToolOutcome<AgentEditFileResult>> {
  try {
    return await withActiveProjectWork(projectId, "agent", "agent edit", () =>
      editFileForAgent(projectId, input),
    )
  } catch (error) {
    const retirement = retirementOutcome<AgentEditFileResult>(error)
    if (retirement) return retirement
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

function parseSearchLine(line: string): AgentSearchMatch | undefined {
  const match = line.match(/^(.+?):(\d+):(.*)$/)
  if (!match) return undefined
  const [, rawPath, rawLine, text] = match
  if (!rawPath || !rawLine || text === undefined) return undefined
  return {
    path: rawPath.startsWith("./") ? rawPath.slice(2) : rawPath,
    line: Number(rawLine),
    text,
  }
}

function isSearchMatch(
  hit: AgentSearchMatch | undefined,
): hit is AgentSearchMatch {
  return hit !== undefined
}

export async function agentSearch(
  projectId: string,
  query: AgentSearchQuery,
): Promise<AgentToolOutcome<AgentSearchResult>> {
  try {
    return await withActiveProjectWork(
      projectId,
      "agent",
      "agent search",
      async () => {
        const pod = getPod(projectId)
        if (!pod) return { ok: false, reason: "no_pod" }

        touchPod(projectId)
        const limit = query.maxResults + 1
        const command = [
          "command -v rg >/dev/null 2>&1 || { echo 'rg not found' >&2; exit 127; }",
          `rg --fixed-strings --line-number --no-heading --color never --hidden -g '!node_modules/**' -g '!.git/**' -g '!.next/**' -g '!dist/**' -g '!build/**' -- ${shellQuote(query.query)} . | head -n ${limit}`,
        ].join(" && ")

        const result = await provider.runPodCommand(pod.sandboxId, command, {
          timeoutMs: SEARCH_TIMEOUT_MS,
          cwd: PROJECT_ROOT,
        })
        if (result.exitCode !== 0)
          return {
            ok: false,
            reason: "failed",
            detail: result.stderr || result.stdout,
          }

        const lines = result.stdout.split(/\r?\n/).filter(Boolean)
        const hits = lines
          .slice(0, query.maxResults)
          .map(parseSearchLine)
          .filter(isSearchMatch)

        return {
          ok: true,
          data: { hits, truncated: lines.length > query.maxResults },
        }
      },
    )
  } catch (error) {
    const retirement = retirementOutcome<AgentSearchResult>(error)
    if (retirement) return retirement
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function agentCheckpoint(
  projectId: string,
  input: AgentCheckpointDataType,
): Promise<AgentToolOutcome<AgentCheckpointResult>> {
  try {
    return await withActiveProjectWork(
      projectId,
      "agent",
      "agent checkpoint",
      () =>
        inCommitQueue(projectId, async () => {
          const pod = getPod(projectId)
          if (!pod) return { ok: false, reason: "no_pod" }

          touchPod(projectId)
          const artifactKeys = checkpointArtifact(
            projectId,
            input.runId,
            input.seq,
          )
          const uploadUrl = await r2.signUploadUrl(
            artifactKeys.stagedKey,
            CHECKPOINT_URL_TTL_SECONDS,
          )

          await requireProjectDocumentsFlushed(projectId)
          const result = await provider.runPodCommand(
            pod.sandboxId,
            checkpointCommand(),
            {
              timeoutMs: CHECKPOINT_TIMEOUT_MS,
              cwd: PROJECT_ROOT,
              envs: {
                FORGEAI_CHECKPOINT_BUNDLE: `${CHECKPOINT_BUNDLE_DIR}/${input.runId}-${input.seq}.bundle`,
                FORGEAI_CHECKPOINT_MESSAGE: input.message,
                FORGEAI_CHECKPOINT_UPLOAD_URL: uploadUrl,
                FORGEAI_GIT_EXCLUDE: EXCLUDES,
              },
            },
          )
          if (result.exitCode !== 0)
            return {
              ok: false,
              reason: "failed",
              detail: result.stderr || result.stdout,
            }

          const commit = outputField(result.stdout, "FORGEAI_COMMIT")
          const sha256 = outputField(result.stdout, "FORGEAI_BUNDLE_SHA256")
          const bytes = Number(
            outputField(result.stdout, "FORGEAI_BUNDLE_BYTES"),
          )
          if (!commit || !sha256 || !Number.isInteger(bytes))
            return {
              ok: false,
              reason: "failed",
              detail: "Checkpoint did not return complete artifact metadata.",
            }
          const artifact = await promoteCheckpointArtifact(
            artifactKeys.stagedKey,
            artifactKeys.key,
            projectId,
            input.runId,
            input.seq,
            commit,
            { key: artifactKeys.key, sha256, bytes },
          )
          return { ok: true, data: { commit, artifact } }
        }),
    )
  } catch (error) {
    const retirement = retirementOutcome<AgentCheckpointResult>(error)
    if (retirement) return retirement
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function agentCheckpointDiff(
  projectId: string,
  input: AgentCheckpointDiffDataType,
): Promise<AgentToolOutcome<AgentCheckpointDiffResult>> {
  try {
    return await withActiveProjectWork(
      projectId,
      "agent",
      "agent checkpoint diff",
      async () => {
        const pod = getPod(projectId)
        if (!pod) return { ok: false, reason: "no_pod" }

        touchPod(projectId)
        await requireProjectDocumentsFlushed(projectId)
        const result = await provider.runPodCommand(
          pod.sandboxId,
          CHECKPOINT_DIFF_COMMAND,
          {
            timeoutMs: CHECKPOINT_TIMEOUT_MS,
            cwd: PROJECT_ROOT,
            envs: {
              FORGEAI_CHECKPOINT: input.commit,
              FORGEAI_DIFF_INDEX: `/tmp/forgeai-diff-${randomUUID()}`,
            },
          },
        )
        if (result.exitCode !== 0)
          return {
            ok: false,
            reason: "failed",
            detail: result.stderr || result.stdout,
          }
        return { ok: true, data: parseCheckpointDiff(result.stdout) }
      },
    )
  } catch (error) {
    const retirement = retirementOutcome<AgentCheckpointDiffResult>(error)
    if (retirement) return retirement
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function agentCheckpointRestore(
  projectId: string,
  input: AgentCheckpointRestoreDataType,
): Promise<AgentToolOutcome<AgentCheckpointRestoreResult>> {
  try {
    return await withActiveProjectWork(
      projectId,
      "agent",
      "agent checkpoint restore",
      () =>
        inCommitQueue(projectId, async () => {
          const pod = getPod(projectId)
          if (!pod) return { ok: false, reason: "no_pod" }

          const paths = [...new Set(input.paths)]
          if (paths.length === 0) return { ok: true, data: { restored: true } }

          touchPod(projectId)
          const command = [
            checkpointImportCommand(),
            checkpointUndoCommand(paths),
          ].join("\n")

          await requireProjectDocumentsFlushed(projectId)
          await verifyCheckpointArtifact(
            input.beforeArtifact,
            input.beforeCommit,
          )
          await verifyCheckpointArtifact(input.afterArtifact, input.afterCommit)
          const beforeUrl = await r2.signDownloadUrl(
            input.beforeArtifact.key,
            "forgeai-before-checkpoint.bundle",
            CHECKPOINT_URL_TTL_SECONDS,
          )
          const afterUrl = await r2.signDownloadUrl(
            input.afterArtifact.key,
            "forgeai-after-checkpoint.bundle",
            CHECKPOINT_URL_TTL_SECONDS,
          )
          const result = await provider.runPodCommand(pod.sandboxId, command, {
            timeoutMs: RESTORE_TIMEOUT_MS,
            cwd: PROJECT_ROOT,
            envs: {
              FORGEAI_AFTER_BUNDLE_SHA256: input.afterArtifact.sha256,
              FORGEAI_AFTER_BUNDLE_URL: afterUrl,
              FORGEAI_BEFORE_COMMIT: input.beforeCommit,
              FORGEAI_BEFORE_BUNDLE_SHA256: input.beforeArtifact.sha256,
              FORGEAI_BEFORE_BUNDLE_URL: beforeUrl,
              FORGEAI_AFTER_COMMIT: input.afterCommit,
              FORGEAI_CHECKPOINT_IMPORT_DIR: `${CHECKPOINT_BUNDLE_DIR}/${input.beforeCommit}-${input.afterCommit}`,
              FORGEAI_UNDO_INDEX: `/tmp/forgeai-undo-index-${randomUUID()}`,
              FORGEAI_UNDO_PATHSPEC: `/tmp/forgeai-undo-paths-${randomUUID()}`,
            },
          })
          if (result.exitCode === CHECKPOINT_UNDO_CONFLICT_EXIT_CODE) {
            const conflicts = parseCheckpointUndoConflicts(result.stdout)
            return {
              ok: false,
              reason: "conflict",
              detail: conflicts.length
                ? `Undo has conflicts in ${conflicts.join(", ")}. Keep the newer changes or undo them manually.`
                : "Undo has conflicts with newer changes. Keep the newer changes or undo them manually.",
            }
          }
          if (result.exitCode !== 0)
            return {
              ok: false,
              reason: "failed",
              detail: result.stderr || result.stdout,
            }
          markProjectDirty(projectId)
          resetOpenDocuments(projectId, paths)
          return { ok: true, data: { restored: true } }
        }),
    )
  } catch (error) {
    const retirement = retirementOutcome<AgentCheckpointRestoreResult>(error)
    if (retirement) return retirement
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}
