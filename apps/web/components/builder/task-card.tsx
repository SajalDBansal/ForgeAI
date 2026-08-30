import type { Message } from "@/lib/types"

export function TaskCard({ m }: { m: Message }) {
  return (
    <div className="border border-hairline rounded-sm">
      <div className="px-3 py-2 hairline-b text-[11px] text-mute flex items-center justify-between">
        <span>[ task plan ]</span>
        <span>
          {m.tasks?.filter((t) => t.status === "done").length}/{m.tasks?.length} done
        </span>
      </div>
      <ul className="p-2 space-y-0.5">
        {m.tasks?.map((t, i) => (
          <li key={i} className="flex items-center gap-2 px-2 py-1 text-sm">
            <span className="text-mute w-6">
              {t.status === "done" ? "[x]" : t.status === "active" ? "[~]" : "[ ]"}
            </span>
            <span
              className={
                t.status === "done"
                  ? "line-through text-mute"
                  : t.status === "active"
                    ? "text-ink font-medium"
                    : "text-body"
              }
            >
              {t.label}
            </span>
            {t.status === "active" && (
              <span className="ml-auto text-[10px] text-mute pulse-dot">running…</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
