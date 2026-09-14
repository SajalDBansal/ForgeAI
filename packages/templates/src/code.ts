import { readdir } from "node:fs/promises"

/** Build output and installed dependencies never ship with a template. */
const EXCLUDED = ["node_modules", ".next", ".turbo"]

// Checks whether a path inside a template's `code/` belongs in the published zip.
// Shared by the zip and the content hash so both see the same files.
export function isTemplateFile(path: string): boolean {
  const segments = path.split("/").flatMap((part) => part.split("\\"))
  return !segments.some((segment) => EXCLUDED.includes(segment))
}

// Lists every shipped file in a template's `code/` as sorted posix-relative paths.
// Sorted so the content hash is identical on every OS.
export async function listTemplateFiles(codeDir: string): Promise<string[]> {
  const found: string[] = []

  // Recursively collects shipped files under `prefix`.
  async function walk(prefix: string): Promise<void> {
    const dir = prefix ? `${codeDir}/${prefix}` : codeDir
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (!isTemplateFile(path)) continue
      if (entry.isDirectory()) await walk(path)
      else found.push(path)
    }
  }

  await walk("")
  return found.sort()
}
