import type { NextConfig } from "next"

// ---------- SECURITY HEADERS ----------

/**
 * CSP is enforced by default. Set CSP_REPORT_ONLY=1 temporarily when testing a policy
 * change so the browser reports violations without blocking the page.
 */
const CSP_REPORT_ONLY = process.env.CSP_REPORT_ONLY === "1"

const isDev = process.env.NODE_ENV !== "production"

/** Each scheme's twin: a socket URL may be written as http(s) or ws(s). */
const SCHEME_TWIN: Record<string, string> = {
  "http:": "ws:",
  "https:": "wss:",
  "ws:": "http:",
  "wss:": "https:",
}

// Returns a URL's origin plus its twin (http ↔ ws, https ↔ wss), for connect-src.
function originsOf(url: string | undefined): string[] {
  if (!url) return []
  const { origin, protocol } = new URL(url)
  return [origin, origin.replace(protocol, SCHEME_TWIN[protocol] ?? protocol)]
}

const previewFrameOrigins = [
  ...originsOf(process.env.NEXT_PUBLIC_AUTH_URL),
  ...originsOf(process.env.NEXT_PUBLIC_PREVIEW_URL),
  "https://*.e2b.app",
  "https://*.e2b.dev",
].join(" ")

// What our pages may load, and from where. Anything not listed is refused (or reported).
const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js and the theme switcher put small inline scripts in every page; dev mode also needs eval.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Tailwind, the editor, the terminal and toasts set inline styles; the brand font is Google Fonts.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // The connected GitHub account's avatar.
  "img-src 'self' data: blob: https://avatars.githubusercontent.com",
  // Data may only go to our own API and live connection, so injected script can't send it elsewhere.
  `connect-src 'self' ${[...originsOf(process.env.NEXT_PUBLIC_AUTH_URL), ...originsOf(process.env.NEXT_PUBLIC_WS_URL)].join(" ")}`,
  // The code editor's language workers.
  "worker-src 'self' blob:",
  // The preview iframe uses ForgeAI's authenticated proxy; E2B is kept for older local previews.
  `frame-src ${previewFrameOrigins}`,
  // No other site may frame ForgeAI (clickjacking).
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ")

const securityHeaders = [
  {
    key: CSP_REPORT_ONLY
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  // Enforced even while the CSP only reports (browsers ignore frame-ancestors in Report-Only).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Features the app never uses. This also applies to the preview iframe.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]),
]

// ---------- CONFIG ----------

// y-monaco imports monaco's editor.api.js, which bun's isolated installs can't resolve from the
// store. It is aliased to the bare "monaco-editor" package, which exports the same API.
const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@forgeAI/ui", "@forgeAI/shared"],
  turbopack: {
    resolveAlias: {
      "monaco-editor/esm/vs/editor/editor.api.js": "monaco-editor",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default nextConfig
