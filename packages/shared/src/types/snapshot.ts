// A project's saved source is one R2 object, overwritten on every save.
// History lives in the project's GitHub repository, not here.

// Builds the R2 key holding a project's current source archive.
// Used by snapshot and restore to find the live copy.
export function snapshotKey(folder: string, projectId: string): string {
  return `${folder}/${projectId}/workspace.tar.gz`
}

// Builds the R2 key an upload lands on before it is verified.
// Keeps the last good snapshot intact until the new one checks out.
export function stagedSnapshotKey(folder: string, projectId: string): string {
  return `${snapshotKey(folder, projectId)}.staged`
}

// Builds the R2 key for a snapshot held back because it deleted a lot of files.
// Restore prefers this copy, since it is what the user actually had.
export function pendingSnapshotKey(folder: string, projectId: string): string {
  return `${snapshotKey(folder, projectId)}.pending`
}

/** A save that would shrink the project a lot, waiting for somebody to confirm it. */
export interface SnapshotShrink {
  /** Files in the project now. */
  files: number
  /** Files in the stored copy the new one would replace. */
  storedFiles: number
  /** When the held copy was taken (ISO). */
  at: string
}

/** Save state for the status bar: idle, saving, saved, held (awaiting confirmation) or failed. */
export type SnapshotState = "idle" | "saving" | "saved" | "held" | "failed"

export interface SnapshotStatus {
  state: SnapshotState
  /** When the stored copy was last replaced. */
  savedAt?: string
  /** Why the last attempt failed. Only with `failed`. */
  message?: string
  /** A large deletion awaiting confirmation. Kept apart from `state` so it survives re-saves. */
  shrink: SnapshotShrink | null
}

/** The message on every project's first commit on GitHub. */
export const INITIAL_COMMIT_MESSAGE = "Initial Commit"

// Builds the R2 key of a pre-GitHub commit's tar archive.
// Only read now, when rolling back to one of those legacy versions.
export function commitKey(
  folder: string,
  projectId: string,
  commitId: string,
): string {
  return `${folder}/${projectId}/commits/${commitId}.tar.gz`
}

// Builds the R2 key for a durable agent checkpoint bundle.
// These live under the project snapshot prefix so project deletion purges them with the rest.
export function agentCheckpointArtifactKey(
  folder: string,
  projectId: string,
  runId: string,
  seq: number,
): string {
  return `${folder}/${projectId}/agent-checkpoints/${runId}/${seq}.bundle`
}

// Folders that never go into a snapshot or commit and are hidden from the file tree.
// Directories only: a file named `build` is still somebody's work.

/** Tool-owned folders, skipped at any depth. */
export const SNAPSHOT_EXCLUDES_ANYWHERE = [
  "node_modules",
  ".venv",
  "__pycache__",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".parcel-cache",
  // Our own scratch space (dev-server logs and pid files).
  ".forgeai",
] as const

/** Skipped only at the project root; deeper down these are ordinary source folders (e.g. `app/build`). */
export const SNAPSHOT_EXCLUDES_AT_ROOT = [
  "venv",
  "vendor",
  "dist",
  "build",
  "target",
  "out",
] as const

const EXCLUDED_ANYWHERE = new Set<string>(SNAPSHOT_EXCLUDES_ANYWHERE)
const EXCLUDED_AT_ROOT = new Set<string>(SNAPSHOT_EXCLUDES_AT_ROOT)

// Checks whether a project-relative path is, or is inside, an excluded folder.
// Pass isDirectory=false for files so a file merely named `build` is kept.
export function isExcludedPath(
  relative: string,
  isDirectory?: boolean,
): boolean {
  const segments = relative
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")

  for (let i = 0; i < segments.length; i++) {
    const isLast = i === segments.length - 1
    if (isLast && isDirectory === false) return false

    const name = segments[i]!
    if (EXCLUDED_ANYWHERE.has(name)) return true
    if (i === 0 && EXCLUDED_AT_ROOT.has(name)) return true
  }
  return false
}

// Builds the `find` predicate that matches every excluded folder.
// Shared by the shell commands below so they all prune the same set.
function excludedFolderPredicate(): string {
  const anywhere = SNAPSHOT_EXCLUDES_ANYWHERE.map((name) => `-name '${name}'`)
  const atRoot = SNAPSHOT_EXCLUDES_AT_ROOT.map((name) => `-path './${name}'`)
  return [...anywhere, ...atRoot].join(" -o ")
}

// Shell that writes every path to archive, NUL-separated, into `listFile`.
// Uses `find` with pruning because `tar --exclude` can't anchor names to the root.
export function snapshotFileListCommand(
  root: string,
  listFile: string,
): string {
  return `(cd '${root}' && find . \\( ${excludedFolderPredicate()} \\) -type d -prune -o -print0) > '${listFile}'`
}

// Shell that deletes the project's own files but keeps dependencies and caches.
// Used by rollback, which replaces source without throwing away the install.
export function clearProjectSourceCommand(root: string): string {
  return `(cd '${root}' && find . \\( ${excludedFolderPredicate()} \\) -type d -prune -o \\( -type f -o -type l \\) -print0 | xargs -0 -r rm -f)`
}

// Shell that removes empty folders deepest-first, leaving excluded folders alone.
// Runs after clearProjectSourceCommand to tidy up what it left behind.
export function pruneEmptyDirsCommand(root: string): string {
  const keep = SNAPSHOT_EXCLUDES_ANYWHERE.flatMap((name) => [
    `-not -name '${name}'`,
    `-not -path '*/${name}/*'`,
  ])
  const keepAtRoot = SNAPSHOT_EXCLUDES_AT_ROOT.flatMap((name) => [
    `-not -path './${name}'`,
    `-not -path './${name}/*'`,
  ])
  return `(cd '${root}' && find . -mindepth 1 -depth -type d -empty ${[...keep, ...keepAtRoot].join(" ")} -delete)`
}

// Shell that gzips the paths listed in `listFile` into `archive`.
// `--ignore-failed-read` tolerates files a running dev server deletes mid-snapshot.
export function snapshotArchiveCommand(
  root: string,
  listFile: string,
  archive: string,
): string {
  return `tar --null --no-recursion --ignore-failed-read -czf '${archive}' -C '${root}' -T '${listFile}'`
}

/** Metadata recorded on a snapshot when it is promoted from staging. */
export interface SnapshotMetadata {
  /** The E2B image the source came from, so a restore uses a matching image. */
  templateid: string
  /** The published template version, when known. */
  templateversion?: string
  /** ISO timestamp of when the snapshot was taken. */
  takenat: string
}
