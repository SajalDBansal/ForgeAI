"use client"

// Two-tab switch between the conversation and the work area on small screens.
// Hidden on desktop, where both are shown side by side.
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
    <div className="hairline-b flex md:hidden">
      {(["chat", "work"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 py-2.5 text-sm ${view === v ? "text-ink border-ink border-b-2" : "text-mute"}`}
        >
          {v === "chat" ? "Conversation" : workLabel}
        </button>
      ))}
    </div>
  )
}
