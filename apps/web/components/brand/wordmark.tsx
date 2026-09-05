const LINES = ["█▀▀ █▀█ █▀█ █▀▀ █▀▀ ▄▀█ █", "█▀  █▄█ █▀▄ █▄█ ██▄ █▀█ █"]

// Large block-letter ASCII "FORGEAI" wordmark.
// Used on auth and marketing screens.
export function Wordmark({
  tone = "ink",
  scale = 1,
}: {
  tone?: "ink" | "cream"
  scale?: number
}) {
  const color = tone === "ink" ? "text-ink" : "text-on-dark"
  return (
    <pre
      aria-label="ForgeAI"
      className={`${color} font-mono leading-none font-bold select-none`}
      style={{ fontSize: `${10 * scale}px`, letterSpacing: "0px" }}
    >
      {LINES.join("\n")}
    </pre>
  )
}

// Compact "[FORGE/AI]" text wordmark.
// Used in the sidebar and headers.
export function WordmarkSmall({ tone = "ink" }: { tone?: "ink" | "cream" }) {
  const color = tone === "ink" ? "text-ink" : "text-on-dark"
  return (
    <span className={`${color} font-mono font-bold tracking-tight`}>
      <span className="opacity-60">[</span>FORGE
      <span className="opacity-60">/</span>AI
      <span className="opacity-60">]</span>
    </span>
  )
}
