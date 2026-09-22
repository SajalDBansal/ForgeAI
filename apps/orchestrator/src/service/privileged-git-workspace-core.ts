export function isUnsafeTarEntry(entry: string): boolean {
  const normalized = entry.replaceAll("\\", "/")
  if (!normalized || normalized === "." || normalized === "./") return false
  if (normalized.startsWith("/")) return true
  if (/^[A-Za-z]:\//.test(normalized)) return true
  return normalized.split("/").some((part) => part === "..")
}

export function unsafeTarEntries(listing: string): string[] {
  return listing
    .split(/\r?\n/)
    .filter((entry) => entry.length > 0)
    .filter(isUnsafeTarEntry)
}

export function unsafeTarLinkEntries(verboseListing: string): string[] {
  return verboseListing
    .split(/\r?\n/)
    .filter((entry) => entry.length > 0)
    .filter((entry) => /^[lh]/.test(entry))
}
