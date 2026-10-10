import type {
  AgentCheckpointDiffResult,
  AgentFileChangeStat,
} from "@forgeAI/shared"

// A temporary index includes new files without changing the user's staging area.
export const CHECKPOINT_DIFF_COMMAND = [
  "set -e",
  'git cat-file -e "$FORGEAI_CHECKPOINT^{commit}"',
  'export GIT_INDEX_FILE="$FORGEAI_DIFF_INDEX"',
  'trap \'rm -f "$GIT_INDEX_FILE" "$GIT_INDEX_FILE.lock"\' EXIT',
  'git read-tree "$FORGEAI_CHECKPOINT"',
  "git add -A",
  'git diff --cached --name-status -z --no-renames "$FORGEAI_CHECKPOINT" -- .',
  "printf '\\0__FORGEAI_NUMSTAT__\\0'",
  'git diff --cached --numstat -z --no-renames "$FORGEAI_CHECKPOINT" -- .',
].join("\n")

export const CHECKPOINT_UNDO_CONFLICT_EXIT_CODE = 42
export const CHECKPOINT_UNDO_CONFLICT_MARKER = "__FORGEAI_UNDO_CONFLICTS__"

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function pathspecCommand(paths: string[]): string {
  if (paths.length === 0) return ': > "$FORGEAI_UNDO_PATHSPEC"'
  return `printf '%s\\0' ${paths.map(shellQuote).join(" ")} > "$FORGEAI_UNDO_PATHSPEC"`
}

export function checkpointUndoCommand(paths: string[]): string {
  const pathArgs = paths.map(shellQuote).join(" ")
  return [
    "set -e",
    'git cat-file -e "$FORGEAI_BEFORE_COMMIT^{commit}"',
    'git cat-file -e "$FORGEAI_AFTER_COMMIT^{commit}"',
    'rm -f "$FORGEAI_UNDO_PATHSPEC" "$FORGEAI_UNDO_INDEX" "$FORGEAI_UNDO_INDEX.lock"',
    'trap \'rm -f "$FORGEAI_UNDO_PATHSPEC" "$FORGEAI_UNDO_INDEX" "$FORGEAI_UNDO_INDEX.lock"\' EXIT',
    pathspecCommand(paths),
    'export GIT_INDEX_FILE="$FORGEAI_UNDO_INDEX"',
    'git read-tree "$FORGEAI_AFTER_COMMIT"',
    'git update-index --add --remove -z --stdin < "$FORGEAI_UNDO_PATHSPEC"',
    `if ! git diff --cached --quiet "$FORGEAI_AFTER_COMMIT" -- ${pathArgs}; then`,
    `  printf '${CHECKPOINT_UNDO_CONFLICT_MARKER}\\0'`,
    `  git diff --cached --name-only -z "$FORGEAI_AFTER_COMMIT" -- ${pathArgs}`,
    `  exit ${CHECKPOINT_UNDO_CONFLICT_EXIT_CODE}`,
    "fi",
    "unset GIT_INDEX_FILE",
    'while IFS= read -r -d "" path; do',
    '  if git cat-file -e "$FORGEAI_BEFORE_COMMIT:$path" 2>/dev/null; then',
    '    dir=$(dirname -- "$path")',
    '    [ "$dir" = "." ] || mkdir -p -- "$dir"',
    '    git show "$FORGEAI_BEFORE_COMMIT:$path" > "$path"',
    "  else",
    '    rm -rf -- "$path"',
    "  fi",
    'done < "$FORGEAI_UNDO_PATHSPEC"',
  ].join("\n")
}

export function parseCheckpointUndoConflicts(stdout: string): string[] {
  const markerAt = stdout.indexOf(`${CHECKPOINT_UNDO_CONFLICT_MARKER}\0`)
  if (markerAt < 0) return []
  return stdout
    .slice(markerAt + CHECKPOINT_UNDO_CONFLICT_MARKER.length + 1)
    .split("\0")
    .filter(Boolean)
}

// NUL delimiters preserve spaces, tabs and non-ASCII characters in file names.
export function parseCheckpointDiff(stdout: string): AgentCheckpointDiffResult {
  const [statusText = "", numstatText = ""] = stdout.split(
    "\0__FORGEAI_NUMSTAT__\0",
  )
  const stats = new Map<string, { additions: number; deletions: number }>()
  for (const entry of numstatText.split("\0")) {
    if (!entry) continue
    const [added, deleted, ...path] = entry.split("\t")
    stats.set(path.join("\t"), {
      additions: Number(added) || 0,
      deletions: Number(deleted) || 0,
    })
  }

  const statuses = statusText.split("\0")
  const files: AgentFileChangeStat[] = []
  for (let i = 0; i + 1 < statuses.length; i += 2) {
    const status = statuses[i]
    const path = statuses[i + 1]
    if (!path) continue
    files.push({
      path,
      action:
        status === "A" ? "created" : status === "D" ? "deleted" : "updated",
      ...(stats.get(path) ?? { additions: 0, deletions: 0 }),
    })
  }
  return {
    files,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
  }
}
