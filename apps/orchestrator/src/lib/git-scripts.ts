import {
  SNAPSHOT_EXCLUDES_ANYWHERE,
  SNAPSHOT_EXCLUDES_AT_ROOT,
  type CommitFileStat,
  type GitCommitInfo,
  type GitRefusal,
  type GitShiftDetails,
} from "@forgeAI/shared"

// Shell scripts git.service runs in the sandbox, plus parsers for their output.
// Every input arrives via env vars (see gitEnvs), never interpolated from a request.

/** GitHub refuses files over 100 MB; saying so before the push beats its error. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024

/** More than this many files in one commit's list is kept to this many. */
export const MAX_LISTED_FILES = 1000

/** Git's exclude file: everything snapshots skip, plus .env secrets. Project .gitignore applies on top. */
export const EXCLUDES = [
  "# Written by ForgeAI — see docs/07-GITHUB-VERSION-CONTROL.md §3.1",
  ...SNAPSHOT_EXCLUDES_ANYWHERE.map((name) => `${name}/`),
  ...SNAPSHOT_EXCLUDES_AT_ROOT.map((name) => `/${name}/`),
  ".env",
  ".env.*",
  "!.env.example",
  "!.env.sample",
].join("\n")

/** Exit codes the scripts use to say *why* they stopped. */
export const EXIT = {
  SHIFT_AHEAD: 10,
  SHIFT_REWRITTEN: 11,
  UNREACHABLE: 12,
  TOO_LARGE: 13,
  REJECTED: 14,
  UNKNOWN_COMMIT: 15,
  MOVED: 16,
  PRIVILEGED_BUSY: 17,
  NO_GIT: 127,
} as const

/** Start of every script: create git if missing and fetch GitHub's branch. Prints GITHUB_HEAD. */
export const SETUP = `
set -e
cd "$GIT_WORK_TREE"
command -v git >/dev/null 2>&1 || exit ${EXIT.NO_GIT}
if [ ! -f "$GIT_DIR/HEAD" ]; then
  mkdir -p "$GIT_DIR"
  git init -q -b "$FORGEAI_BRANCH"
fi
git config core.bare false
mkdir -p "$GIT_DIR/info"
printf '%s\\n' "$FORGEAI_EXCLUDE" > "$GIT_DIR/info/exclude"
git remote remove origin >/dev/null 2>&1 || true
git remote add origin "$FORGEAI_REMOTE_URL"
if ! git fetch -q --no-tags origin "+refs/heads/$FORGEAI_BRANCH:refs/remotes/origin/$FORGEAI_BRANCH" 2>/tmp/forgeai-git.err; then
  cat /tmp/forgeai-git.err >&2
  exit ${EXIT.UNREACHABLE}
fi
GITHUB_HEAD="$(git rev-parse "refs/remotes/origin/$FORGEAI_BRANCH")"
echo "GITHUB_HEAD=$GITHUB_HEAD"
`

/** Refuse if GitHub moved; otherwise point git at the known base without touching any file. */
const GATE = `
if [ "$GITHUB_HEAD" != "$FORGEAI_BASE" ]; then
  if git merge-base --is-ancestor "$FORGEAI_BASE" "$GITHUB_HEAD" 2>/dev/null; then exit ${EXIT.SHIFT_AHEAD}; fi
  exit ${EXIT.SHIFT_REWRITTEN}
fi
git update-ref "refs/heads/$FORGEAI_BRANCH" "$FORGEAI_BASE"
git symbolic-ref HEAD "refs/heads/$FORGEAI_BRANCH"
git reset -q --mixed "$FORGEAI_BASE"
`

/** The start of a commit or rollback: set up, and stop if GitHub moved. */
export const PRELUDE = SETUP + GATE

/** After a shift: classify it, list local uncommitted paths, and print incoming commits. Sets KIND/FROM/LIMIT/RANGE. */
const SHIFT_CONTEXT = `
if git merge-base --is-ancestor "$FORGEAI_BASE" "$GITHUB_HEAD" 2>/dev/null; then KIND=ahead; else KIND=rewritten; fi
if git cat-file -e "$FORGEAI_BASE^{commit}" 2>/dev/null; then FROM="$FORGEAI_BASE"; else FROM="$GITHUB_HEAD"; fi
git update-ref "refs/heads/$FORGEAI_BRANCH" "$FROM"
git symbolic-ref HEAD "refs/heads/$FORGEAI_BRANCH"
git reset -q --mixed "$FROM"
git status --porcelain -z --untracked-files=all | while IFS= read -r -d '' entry; do printf '%s\\0' "\${entry:3}"; done > /tmp/forgeai-local
if [ "$KIND" = ahead ]; then LIMIT=100; RANGE="$FORGEAI_BASE..$GITHUB_HEAD"; else LIMIT=50; RANGE="$GITHUB_HEAD"; fi
echo "STATE=$KIND"
echo "BEGIN_COMMITS"
git log --reverse -n "$LIMIT" --no-renames --numstat --format='GHC=%H%x09%an%x09%ae%x09%aI%x09%s' "$RANGE"
echo "END_COMMITS"
`

/** Where GitHub stands and, if it moved, which local changes overlap and whether each merges cleanly. */
export const CHECK = `${SETUP}
if [ "$GITHUB_HEAD" = "$FORGEAI_BASE" ]; then echo "STATE=same"; exit 0; fi
${SHIFT_CONTEXT}
git diff --numstat --no-renames "$FROM" "$GITHUB_HEAD" | head -n ${MAX_LISTED_FILES} | sed 's/^/FILE=/'
tr '\\0' '\\n' < /tmp/forgeai-local | head -n ${MAX_LISTED_FILES} | sed 's/^/LOCAL=/'
git diff --name-only -z --no-renames "$FROM" "$GITHUB_HEAD" | while IFS= read -r -d '' f; do
  grep -Fxzq -- "$f" /tmp/forgeai-local || continue
  c=1
  if [ -e "$f" ] && git cat-file -e "$FROM:$f" 2>/dev/null && git cat-file -e "$GITHUB_HEAD:$f" 2>/dev/null; then
    git show "$FROM:$f" > /tmp/forgeai-base
    git show "$GITHUB_HEAD:$f" > /tmp/forgeai-theirs
    if git merge-file -p -q "$f" /tmp/forgeai-base /tmp/forgeai-theirs >/dev/null 2>&1; then c=0; fi
  fi
  printf 'OVERLAP=%s\\t%s\\n' "$c" "$f"
done
`

/** First half of every resolve: confirm GitHub hasn't moved again, then back up all local work. */
const RESOLVE_BEGIN = `${SETUP}
if [ "$GITHUB_HEAD" = "$FORGEAI_BASE" ]; then echo "STATE=same"; echo "NEW_BASE=$GITHUB_HEAD"; exit 0; fi
if [ "$GITHUB_HEAD" != "$FORGEAI_EXPECT" ]; then exit ${EXIT.MOVED}; fi
${SHIFT_CONTEXT}
git add -A
BACKUP="$(git commit-tree "$(git write-tree)" -p "$FROM" -m "ForgeAI: the project as it was before GitHub's changes were brought in")"
git update-ref "refs/forgeai/backup/$(date +%s)" "$BACKUP"
echo "BACKUP=$BACKUP"
git reset -q
`

/** Take GitHub's changes; with "merge", locally edited files are merged line by line and picks settle conflicts. */
export const RESOLVE_TAKE_GITHUB = `${RESOLVE_BEGIN}
if [ "$FROM" = "$GITHUB_HEAD" ]; then
  tr '\\0' '\\n' < /tmp/forgeai-local | sed 's/^/REPLACED=/'
  git reset -q --hard "$GITHUB_HEAD"
  git clean -fdq
else
  git diff --name-status -z --no-renames "$FROM" "$GITHUB_HEAD" | while IFS= read -r -d '' st && IFS= read -r -d '' f; do
    mine=0
    grep -Fxzq -- "$f" /tmp/forgeai-local && mine=1
    if [ "$mine" = 1 ] && [ "$FORGEAI_CHOICE" = merge ]; then
      if [ -e "$f" ] && git cat-file -e "$FROM:$f" 2>/dev/null && git cat-file -e "$GITHUB_HEAD:$f" 2>/dev/null; then
        git show "$FROM:$f" > /tmp/forgeai-base
        git show "$GITHUB_HEAD:$f" > /tmp/forgeai-theirs
        if git merge-file -q "$f" /tmp/forgeai-base /tmp/forgeai-theirs 2>/dev/null; then echo "MERGED=$f"; continue; fi
        git show "$BACKUP:$f" > "$f"
      fi
      if printf '%s\\n' "$FORGEAI_PICKS" | grep -Fxq -- "mine	$f"; then echo "KEPT=$f"; continue; fi
    fi
    if [ "$st" = D ]; then rm -f -- "$f"; else git checkout -q "$GITHUB_HEAD" -- "$f"; fi
    if [ "$mine" = 1 ]; then echo "REPLACED=$f"; fi
  done
fi
git update-ref "refs/heads/$FORGEAI_BRANCH" "$GITHUB_HEAD"
git reset -q --mixed "$GITHUB_HEAD"
echo "NEW_BASE=$GITHUB_HEAD"
`

/** Keep this version: take GitHub's history, then commit the local files on top (no force-push). */
export const RESOLVE_KEEP_MINE = `${RESOLVE_BEGIN}
git update-ref "refs/heads/$FORGEAI_BRANCH" "$GITHUB_HEAD"
git reset -q --mixed "$GITHUB_HEAD"
echo "NEW_BASE=$GITHUB_HEAD"
`

/** Puts one file back as it was in a backup commit ("Restore my version"). */
export const RESTORE_FILE = `
set -e
cd "$GIT_WORK_TREE"
git cat-file -e "$FORGEAI_BACKUP:$FORGEAI_PATH" 2>/dev/null || exit ${EXIT.UNKNOWN_COMMIT}
mkdir -p "$(dirname -- "$FORGEAI_PATH")"
git show "$FORGEAI_BACKUP:$FORGEAI_PATH" > "$FORGEAI_PATH"
`

/** Stage, commit and push; a failed push undoes the commit so ForgeAI never holds one GitHub doesn't. */
export const COMMIT_AND_PUSH = `
git add -A
if git diff --cached --quiet; then echo "UNCHANGED=1"; exit 0; fi
BIG="$(git diff --cached --name-only --diff-filter=AM -z | xargs -0 -r stat -c '%s %n' -- | awk '$1 > ${MAX_FILE_BYTES} { $1 = ""; sub(/^ /, ""); print }')"
if [ -n "$BIG" ]; then git reset -q; printf '%s\\n' "$BIG" | sed 's/^/BIG=/'; exit ${EXIT.TOO_LARGE}; fi
printf '%s' "$FORGEAI_MESSAGE" | git commit -q --no-verify -F -
echo "SHA=$(git rev-parse HEAD)"
git show --numstat --no-renames --format= HEAD | head -n ${MAX_LISTED_FILES} | sed 's/^/NUM=/'
if ! git push -q --no-verify origin "HEAD:refs/heads/$FORGEAI_BRANCH" 2>/tmp/forgeai-git.err; then
  git reset -q --soft HEAD~1
  if grep -qiE 'rejected|non-fast-forward|fetch first' /tmp/forgeai-git.err; then exit ${EXIT.REJECTED}; fi
  cat /tmp/forgeai-git.err >&2
  exit ${EXIT.UNREACHABLE}
fi
echo "PUSHED=1"
`

/** Restore every file to $FORGEAI_TARGET (ignored folders untouched), backing up local changes first. */
export const RESTORE = `
git cat-file -e "$FORGEAI_TARGET^{commit}" 2>/dev/null || exit ${EXIT.UNKNOWN_COMMIT}
BACKUP="$(git stash create 2>/dev/null || true)"
if [ -n "$BACKUP" ]; then git update-ref "refs/forgeai/backup/$(date +%s)" "$BACKUP"; fi
git restore --source="$FORGEAI_TARGET" --staged --worktree -- :/
git clean -fdq
`

// Reads the value of a `NAME=value` line from script output.
// Used to pick single results like SHA or GITHUB_HEAD.
export function field(stdout: string, name: string): string | undefined {
  return stdout.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim()
}

// Maps a script's exit code to the refusal it stands for, or null for a real failure.
// Lets callers answer "GitHub moved" or "push rejected" instead of a generic error.
export function refusalFor(
  exitCode: number,
  stdout: string,
  stderr: string,
): GitRefusal | null {
  const githubHead = field(stdout, "GITHUB_HEAD") ?? ""
  switch (exitCode) {
    case EXIT.SHIFT_AHEAD:
      return { reason: "shift", shift: { kind: "ahead", githubHead } }
    case EXIT.SHIFT_REWRITTEN:
      return { reason: "shift", shift: { kind: "rewritten", githubHead } }
    case EXIT.UNREACHABLE:
      return { reason: "unreachable", detail: stderr.trim().slice(0, 300) }
    case EXIT.TOO_LARGE:
      return {
        reason: "too_large",
        files: [...stdout.matchAll(/^BIG=(.*)$/gm)].map((m) => m[1]!),
      }
    case EXIT.REJECTED:
      return { reason: "rejected" }
    case EXIT.UNKNOWN_COMMIT:
      return { reason: "unknown_commit" }
    case EXIT.PRIVILEGED_BUSY:
      return {
        reason: "privileged_busy",
        blockers: fields(stdout, "BLOCKER"),
      }
    case EXIT.NO_GIT:
      return { reason: "no_git" }
    case EXIT.MOVED:
      return { reason: "moved", githubHead }
    default:
      return null
  }
}

// Converts one numstat regex match into a file stat; binary files ("-") count 0 lines.
// Shared by parseNumstat and parseCommits.
function numstatLine(m: RegExpMatchArray): CommitFileStat {
  return {
    path: m[3]!,
    // Binary files show "-": they changed, but not by lines.
    additions: m[1] === "-" ? 0 : Number(m[1]),
    deletions: m[2] === "-" ? 0 : Number(m[2]),
  }
}

// Parses numstat lines (`added<TAB>deleted<TAB>path`) printed behind `prefix`.
// Gives per-file line counts for commits and shifts.
export function parseNumstat(
  stdout: string,
  prefix = "NUM=",
): CommitFileStat[] {
  return [
    ...stdout.matchAll(new RegExp(`^${prefix}(\\S+)\\t(\\S+)\\t(.+)$`, "gm")),
  ].map(numstatLine)
}

// Parses the commits between BEGIN_COMMITS and END_COMMITS, each with its files.
// Used to show what a GitHub shift brings in.
export function parseCommits(stdout: string): GitCommitInfo[] {
  const section =
    stdout.split(/^BEGIN_COMMITS$/m)[1]?.split(/^END_COMMITS$/m)[0] ?? ""
  const commits: GitCommitInfo[] = []
  for (const line of section.split("\n")) {
    const head = line.match(
      /^GHC=([0-9a-f]{40})\t([^\t]*)\t([^\t]*)\t([^\t]*)\t(.*)$/,
    )
    if (head) {
      commits.push({
        sha: head[1]!,
        authorName: head[2]!,
        authorEmail: head[3]!,
        date: head[4]!,
        message: head[5]!,
        files: [],
      })
      continue
    }
    const stat = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
    if (stat && commits.length)
      commits[commits.length - 1]!.files.push(numstatLine(stat))
  }
  return commits
}

// Parses CHECK's output into the shift details shown in the popup.
// Covers incoming commits, changed files, local changes and overlaps.
export function parseShift(stdout: string): GitShiftDetails {
  return {
    kind: field(stdout, "STATE") === "ahead" ? "ahead" : "rewritten",
    githubHead: field(stdout, "GITHUB_HEAD") ?? "",
    commits: parseCommits(stdout),
    files: parseNumstat(stdout, "FILE="),
    localChanges: fields(stdout, "LOCAL"),
    overlaps: [...stdout.matchAll(/^OVERLAP=([01])\t(.+)$/gm)].map((m) => ({
      path: m[2]!,
      conflict: m[1] === "1",
    })),
  }
}

// Collects every value of a repeated `NAME=value` line.
// Used for lists like REPLACED, KEPT and MERGED.
export function fields(stdout: string, name: string): string[] {
  return [...stdout.matchAll(new RegExp(`^${name}=(.*)$`, "gm"))].map(
    (m) => m[1]!,
  )
}
