// One agent plan step with a [x] / [~] / [ ] marker.
// The active step is highlighted and shows "running…".
export function PlanRow({
  status,
  label,
}: {
  status: "done" | "active" | "pending"
  label: string
}) {
  return (
    <li className="flex items-center gap-2">
      <span className="text-mute w-7">
        {status === "done" ? "[x]" : status === "active" ? "[~]" : "[ ]"}
      </span>
      <span
        className={
          status === "active"
            ? "text-ink font-medium"
            : status === "done"
              ? "text-mute line-through"
              : "text-body"
        }
      >
        {label}
      </span>
      {status === "active" && (
        <span className="text-mute pulse-dot ml-2 text-[10px]">running…</span>
      )}
    </li>
  )
}
