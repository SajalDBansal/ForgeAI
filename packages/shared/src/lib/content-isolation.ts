export const PREVIEW_IFRAME_SANDBOX = [
  "allow-downloads",
  "allow-forms",
  "allow-modals",
  "allow-pointer-lock",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-same-origin",
  "allow-scripts",
].join(" ")

export const PROXIED_PREVIEW_IFRAME_SANDBOX = PREVIEW_IFRAME_SANDBOX.split(" ")
  .filter((value) => value !== "allow-same-origin")
  .join(" ")

export const PREVIEW_IFRAME_REFERRER_POLICY = "no-referrer"
export const EXTERNAL_LINK_TARGET = "_blank"
export const EXTERNAL_LINK_REL = "noreferrer noopener"

const TRUSTED_PREVIEW_HOST_SUFFIXES = [".e2b.app", ".e2b.dev"]
const SAFE_EXTERNAL_LINK_PROTOCOLS = new Set(["https:", "http:", "mailto:"])

function originOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function isTrustedPreviewHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return TRUSTED_PREVIEW_HOST_SUFFIXES.some(
    (suffix) => lower.endsWith(suffix) && lower.length > suffix.length,
  )
}

export function safePreviewUrl(
  value: string | null | undefined,
  appOrigin?: string,
): string | null {
  if (!value?.trim()) return null

  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return null
    if (!isTrustedPreviewHost(url.hostname)) return null
    if (originOf(appOrigin) === url.origin) return null
    return url.href
  } catch {
    return null
  }
}

export function safeExternalHref(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null

  try {
    const url = new URL(value)
    return SAFE_EXTERNAL_LINK_PROTOCOLS.has(url.protocol) ? url.href : null
  } catch {
    return null
  }
}
