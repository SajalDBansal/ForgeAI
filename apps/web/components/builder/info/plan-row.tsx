export function PlanRow({ status, label }: { status: "done" | "active" | "pending"; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="text-mute w-7">{status === "done" ? "[x]" : status === "active" ? "[~]" : "[ ]"}</span>
      <span className={status === "active" ? "text-ink font-medium" : status === "done" ? "text-mute line-through" : "text-body"}>
        {label}
      </span>
      {status === "active" && <span className="ml-2 text-[10px] text-mute pulse-dot">running…</span>}
    </li>
  )
}
