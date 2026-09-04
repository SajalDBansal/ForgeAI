// Every NEXT_PUBLIC_* value the web app reads, in one place. Next.js copies these into the
// browser bundle at build time, so each must be written out in full (`process.env.NEXT_PUBLIC_X`)
// and none of them may hold a secret. The app has no server-only variables today.
export const PUBLIC_ENV = {
  /** The API server's address (also used by server components to reach it). */
  AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL,
  /** Public base URL for global preview links; falls back to the API origin locally. */
  PREVIEW_URL:
    process.env.NEXT_PUBLIC_PREVIEW_URL ?? process.env.NEXT_PUBLIC_AUTH_URL,
  /** The WebSocket server's address, for live project updates. */
  WS_URL: process.env.NEXT_PUBLIC_WS_URL,
}
