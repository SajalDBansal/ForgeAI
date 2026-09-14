// Which ignored folders the file tree shows as a closed, greyed row, and how it labels them.
//
// No imports, on purpose: the browser imports this file directly
// (`@forgeAI/shared/types/ignored-folders`), and the web bundler can't follow this package's
// `./x.js` imports between files. Keep it self-contained, like `types/presence.ts`.

/** How the tree labels an ignored folder it shows as a closed, greyed row. */
export type IgnoredFolderKind = "dependencies" | "build" | "cache" | "git"

const IGNORED_FOLDER_KINDS: Record<string, IgnoredFolderKind> = {
  node_modules: "dependencies",
  ".venv": "dependencies",
  venv: "dependencies",
  vendor: "dependencies",
  ".next": "build",
  ".nuxt": "build",
  ".svelte-kit": "build",
  dist: "build",
  build: "build",
  out: "build",
  target: "build",
  ".turbo": "cache",
  ".cache": "cache",
  ".parcel-cache": "cache",
  __pycache__: "cache",
  ".git": "git",
}

// Says how the tree shows an ignored folder by its name, or undefined to leave it out entirely.
// Our own scratch space (`.forgeai`) has no kind, so it never appears.
export function ignoredFolderKind(name: string): IgnoredFolderKind | undefined {
  return Object.hasOwn(IGNORED_FOLDER_KINDS, name)
    ? IGNORED_FOLDER_KINDS[name]
    : undefined
}
