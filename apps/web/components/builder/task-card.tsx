import type { Message } from "@/lib/types"

// The agent's task checklist with done/active/pending markers.
// Shows how many tasks are done.
export function TaskCard({ m }: { m: Message }) {
  return (
    <div className="border-hairline rounded-sm border">
      <div className="hairline-b text-mute flex items-center justify-between px-3 py-2 text-[11px]">
        <span>[ task plan ]</span>
        <span>
          {m.tasks?.filter((t) => t.status === "done").length}/{m.tasks?.length}{" "}
          done
        </span>
      </div>
      <ul className="space-y-0.5 p-2">
        {m.tasks?.map((t, i) => (
          <li key={i} className="flex items-center gap-2 px-2 py-1 text-sm">
            <span className="text-mute w-6">
              {t.status === "done"
                ? "[x]"
                : t.status === "active"
                  ? "[~]"
                  : "[ ]"}
            </span>
            <span
              className={
                t.status === "done"
                  ? "text-mute line-through"
                  : t.status === "active"
                    ? "text-ink font-medium"
                    : "text-body"
              }
            >
              {t.label}
            </span>
            {t.status === "active" && (
              <span className="text-mute pulse-dot ml-auto text-[10px]">
                running…
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
