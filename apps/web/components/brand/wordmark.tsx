const LINES = [
  "█▀▀ █▀█ █▀█ █▀▀ █▀▀ ▄▀█ █",
  "█▀  █▄█ █▀▄ █▄█ ██▄ █▀█ █",
]

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
      className={`${color} font-mono font-bold leading-none select-none`}
      style={{ fontSize: `${10 * scale}px`, letterSpacing: "0px" }}
    >
      {LINES.join("\n")}
    </pre>
  )
}

export function WordmarkSmall({ tone = "ink" }: { tone?: "ink" | "cream" }) {
  const color = tone === "ink" ? "text-ink" : "text-on-dark"
  return (
    <span className={`${color} font-mono font-bold tracking-tight`}>
      <span className="opacity-60">[</span>FORGE
      <span className="opacity-60">/</span>AI<span className="opacity-60">]</span>
    </span>
  )
}
