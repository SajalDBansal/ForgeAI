"use client"

export function MobileViewSwitch({
  view,
  onChange,
  workLabel,
}: {
  view: "chat" | "work"
  onChange: (v: "chat" | "work") => void
  workLabel: string
}) {
  return (
    <div className="md:hidden hairline-b flex">
      {(["chat", "work"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 py-2.5 text-sm ${view === v ? "text-ink border-b-2 border-ink" : "text-mute"}`}
        >
          {v === "chat" ? "Conversation" : workLabel}
        </button>
      ))}
    </div>
  )
}
