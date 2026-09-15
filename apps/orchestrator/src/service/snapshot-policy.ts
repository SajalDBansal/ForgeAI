/** A save keeping less than this share of the stored file count is held for confirmation. */
export const MIN_KEPT_FILE_RATIO = 0.5

/** Below this many stored files the proportional shrink guard does not apply. */
export const FILE_GUARD_FLOOR = 10

export function parseSnapshotFileCount(stdout: string): number | undefined {
  const matches = [...stdout.matchAll(/^FILES=(\d+)$/gm)]
  const raw = matches.at(-1)?.[1]
  if (!raw) return undefined
  const count = Number(raw)
  return Number.isInteger(count) && count > 0 ? count : undefined
}

export function isUnsafeSnapshotShrink(
  storedFiles: number,
  files: number,
): boolean {
  if (!Number.isInteger(storedFiles) || storedFiles <= 0) return false
  if (!Number.isInteger(files) || files <= 0) return true
  return (
    storedFiles > FILE_GUARD_FLOOR && files < storedFiles * MIN_KEPT_FILE_RATIO
  )
}
