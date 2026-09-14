const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

type Parts = [number, number, number]

// Parses "major.minor.patch" into numbers, naming the template on error.
// Used by every version helper in this file.
function parse(version: string, template: string): Parts {
  const match = SEMVER.exec(version)
  if (!match)
    throw new Error(
      `${template}: version "${version}" is not major.minor.patch`,
    )
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

// Checks whether one parsed version is strictly newer than another.
// Used to decide if a declared version should win over the published one.
function isNewer(candidate: Parts, current: Parts): boolean {
  for (let i = 0; i < candidate.length; i++) {
    if (candidate[i] !== current[i]) return candidate[i]! > current[i]!
  }
  return false
}

// Picks the version a changed template should publish as.
// A declared version ahead of the published one wins; otherwise the patch is bumped.
export function nextVersion(
  declared: string,
  published: string | undefined,
  template: string,
): string {
  if (!published) return declared
  if (isNewer(parse(declared, template), parse(published, template)))
    return declared

  const [major, minor, patch] = parse(published, template)
  return `${major}.${minor}.${patch + 1}`
}

// Sort comparator that orders versions newest first.
// Used to find the latest published version.
export function compareVersionsDesc(a: string, b: string): number {
  const pa = parse(a, "sort")
  const pb = parse(b, "sort")
  for (let i = 0; i < pa.length; i++) {
    if (pa[i] !== pb[i]) return pb[i]! - pa[i]!
  }
  return 0
}

// Checks whether a string is a plain major.minor.patch version.
// Filters E2B tags down to real version tags.
export function isVersion(value: string): boolean {
  return SEMVER.test(value)
}

// Returns the next patch version (`1.0.3` -> `1.0.4`).
// Used to skip past version numbers that are already taken.
export function bumpPatch(version: string): string {
  const [major, minor, patch] = parse(version, "bump")
  return `${major}.${minor}.${patch + 1}`
}
