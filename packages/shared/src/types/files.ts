import { isExcludedPath } from "./snapshot.js"

export { ignoredFolderKind, type IgnoredFolderKind } from "./ignored-folders.js"

// Where every template bakes the project inside its sandbox (the image's WORKDIR).
// The single source of truth for that path across all services.
export const PROJECT_ROOT = "/home/user/app"

// Resolves a browser-supplied path to an absolute path inside the project root.
// Guards the file endpoints: returns undefined for anything that escapes the project.
export function resolveProjectPath(input: string): string | undefined {
  // A NUL would make the checked path and the opened path differ.
  if (input.includes("\0")) return undefined

  const relative = stripProjectRoot(input.trim())
  if (relative === undefined) return undefined

  const parts: string[] = []
  for (const segment of relative.split("/")) {
    if (segment === "" || segment === ".") continue
    if (segment === "..") {
      // Climbing above the root is refused, not clamped.
      if (parts.length === 0) return undefined
      parts.pop()
      continue
    }
    parts.push(segment)
  }

  return parts.length ? `${PROJECT_ROOT}/${parts.join("/")}` : PROJECT_ROOT
}

// Converts an absolute path under the project root into a relative one.
// Helper for resolveProjectPath; returns undefined for absolute paths outside the root.
function stripProjectRoot(path: string): string | undefined {
  if (!path.startsWith("/")) return path
  if (path === PROJECT_ROOT) return ""
  if (path.startsWith(`${PROJECT_ROOT}/`))
    return path.slice(PROJECT_ROOT.length + 1)
  return undefined
}

// Turns an absolute sandbox path into the project-relative path the UI shows.
// Returns "" for the root itself and undefined for anything outside it.
export function toProjectPath(absolute: string): string | undefined {
  if (absolute === PROJECT_ROOT) return ""
  if (!absolute.startsWith(`${PROJECT_ROOT}/`)) return undefined
  return absolute.slice(PROJECT_ROOT.length + 1)
}

// Checks whether a path is inside a hidden folder like node_modules, .git or build output.
// Keeps the file tree, the file watcher and snapshots agreeing on what the project is.
export function isIgnoredPath(path: string, isDirectory?: boolean): boolean {
  const relative = path.startsWith(PROJECT_ROOT)
    ? (toProjectPath(path) ?? path)
    : path
  return isExcludedPath(relative, isDirectory)
}
