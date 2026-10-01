import {
  ignoredFolderKind,
  isIgnoredPath,
  PROJECT_ROOT,
  resolveProjectPath,
  toProjectPath,
} from "@forgeAI/shared"
import type { PodFile, PodFileListing } from "@forgeAI/shared"

import { ENV_CONFIG } from "../envConfig.js"
import { EDITOR_READ } from "../lib/file-limits.js"
import { getPod, markProjectDirty } from "../state.js"
import { touchPod } from "./activity.service.js"
import { provider } from "../lib/provider.js"

// The file endpoints: list a folder, read a file, write a file. Every path is re-checked here,
// the last guard before the sandbox. Shared documents (the editor) live in document.service.ts.

// Sorts folders first, then by name.
// The order the file tree renders in.
function compareTreeEntries(a: PodFile, b: PodFile): number {
  return a.isDirectory === b.isDirectory
    ? a.name.localeCompare(b.name)
    : a.isDirectory
      ? -1
      : 1
}

// Returns the folder that holds a project-relative path ("" for top-level entries).
function parentFolder(path: string): string {
  const cut = path.lastIndexOf("/")
  return cut === -1 ? "" : path.slice(0, cut)
}

// Keeps at most FILE_TREE_MAX_ENTRIES per folder (folders first, by name) and counts the rest.
// A folder of 6,000 generated files would otherwise freeze the tree that draws it.
function capPerFolder(files: PodFile[]): PodFileListing {
  const byFolder = new Map<string, PodFile[]>()
  for (const file of files) {
    const parent = parentFolder(file.path)
    const siblings = byFolder.get(parent)
    if (siblings) siblings.push(file)
    else byFolder.set(parent, [file])
  }

  const max = Math.max(1, ENV_CONFIG.FILE_TREE_MAX_ENTRIES)
  const kept: PodFile[] = []
  const truncated: Record<string, number> = {}
  for (const [folder, siblings] of byFolder) {
    siblings.sort(compareTreeEntries)
    kept.push(...siblings.slice(0, max))
    if (siblings.length > max) truncated[folder] = siblings.length - max
  }
  return { files: kept.sort(compareTreeEntries), truncated }
}

// Lists a project folder with project-relative paths. Ignored folders (node_modules, .next…)
// come back as one `hidden` entry each, never their contents; big folders are capped.
export async function listProjectFiles(
  projectId: string,
  path: string | undefined,
  depth: number,
): Promise<PodFileListing | undefined> {
  const pod = getPod(projectId)
  if (!pod) return undefined

  const resolved = resolveProjectPath(path ?? PROJECT_ROOT)
  if (!resolved) return undefined

  touchPod(projectId)
  const entries = await provider.listPodFiles(pod.sandboxId, resolved, depth)
  if (!entries) return undefined

  const files: PodFile[] = []
  for (const entry of entries) {
    const relative = toProjectPath(entry.path)
    // Skip anything outside the project (e.g. a symlink elsewhere).
    if (relative === undefined) continue

    const file: PodFile = {
      name: entry.name,
      path: relative,
      isDirectory: entry.isDirectory,
      size: entry.size,
      modifiedAt: entry.modifiedAt,
    }

    if (isIgnoredPath(relative, entry.isDirectory)) {
      // Only the ignored folder itself is shown, as a closed row; anything inside it is dropped.
      const hidden =
        entry.isDirectory && !isIgnoredPath(parentFolder(relative), true)
          ? ignoredFolderKind(entry.name)
          : undefined
      if (hidden) files.push({ ...file, hidden })
      continue
    }

    files.push(file)
  }

  return capPerFolder(files)
}

// Reads a project file after re-checking the path; throws FileTooLargeError or BinaryFileError (EDITOR_READ).
// The last guard between a path and the sandbox, even if api-server already checked it.
export async function readPodFile(
  projectId: string,
  path: string,
): Promise<string | undefined> {
  const pod = getPod(projectId)
  if (!pod) return undefined

  const resolved = resolveProjectPath(path)
  if (!resolved) return undefined

  touchPod(projectId)
  return provider.readFileFromPod(pod.sandboxId, resolved, EDITOR_READ)
}

// Writes a project file into the sandbox and marks the project dirty.
// The file only reaches R2 on the next snapshot.
export async function writePodFile(
  projectId: string,
  path: string,
  content: string,
): Promise<boolean> {
  const pod = getPod(projectId)
  if (!pod) return false

  const resolved = resolveProjectPath(path)
  if (!resolved) return false

  touchPod(projectId)
  await provider.writeFileToPod(pod.sandboxId, resolved, content)
  markProjectDirty(projectId)
  return true
}
