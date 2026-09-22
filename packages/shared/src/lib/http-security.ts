export const CSRF_BLOCK_CODE = "CSRF_ORIGIN_BLOCKED"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

export interface BrowserOriginPolicyInput {
  method: string
  origin?: string | null
  referer?: string | null
  cookie?: string | null
  secFetchSite?: string | null
  allowedOrigins: Iterable<string>
}

export function normalizedOrigin(
  value: string | null | undefined,
): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function allowedOriginSet(origins: Iterable<string>): Set<string> {
  const allowed = new Set<string>()
  for (const origin of origins) {
    const normalized = normalizedOrigin(origin)
    if (normalized) allowed.add(normalized)
  }
  return allowed
}

export function isAllowedOrigin(
  value: string | null | undefined,
  allowedOrigins: Iterable<string>,
): boolean {
  const normalized = normalizedOrigin(value)
  return !!normalized && allowedOriginSet(allowedOrigins).has(normalized)
}

export function browserCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: Iterable<string>,
): boolean {
  return !origin || isAllowedOrigin(origin, allowedOrigins)
}

function requestOrigin({
  origin,
  referer,
}: Pick<BrowserOriginPolicyInput, "origin" | "referer">): string | null {
  return normalizedOrigin(origin) ?? normalizedOrigin(referer)
}

export function csrfOriginFailureReason({
  method,
  origin,
  referer,
  cookie,
  secFetchSite,
  allowedOrigins,
}: BrowserOriginPolicyInput): string | null {
  if (SAFE_METHODS.has(method.toUpperCase())) return null

  if (secFetchSite === "cross-site") return "cross-site browser request"

  const hasCookie = !!cookie?.trim()
  const browserOrigin = requestOrigin({ origin, referer })

  if (browserOrigin && !isAllowedOrigin(browserOrigin, allowedOrigins))
    return "untrusted request origin"

  if (hasCookie && !browserOrigin) return "missing request origin"

  return null
}
