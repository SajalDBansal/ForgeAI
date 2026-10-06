"use client"

import type { PersonPresence } from "@forgeAI/shared"

import type { ProjectMember } from "@/lib/build"
import { collaboratorInitials } from "@/lib/types"
import { ModalShell } from "@/components/modal/modal-shell"

const ROLE_LABEL: Record<ProjectMember["role"], string> = {
  OWNER: "Owner",
  EDITOR: "Editor",
  VIEWER: "Viewer",
}

// Shortens a long path to its last two segments.
// Keeps activity labels readable.
function fileLabel(path: string): string {
  return path.length <= 40 ? path : `…/${path.split("/").slice(-2).join("/")}`
}

// Describes a person's current activity in words ("Editing app/page.tsx").
// Used in the people dialog and the "N active" list.
export function describeActivity(person: PersonPresence): string {
  if (
    person.userId === "forgeai-agent" &&
    person.activity?.kind === "code" &&
    person.activity.path
  ) {
    return `Editing ${fileLabel(person.activity.path)}`
  }
  const activity = person.activity
  if (!activity) return "Active"
  switch (activity.kind) {
    case "preview":
      return "Viewing the preview"
    case "code":
      if (!activity.path) return "Browsing the code"
      return `${person.editing ? "Editing" : "Viewing"} ${fileLabel(activity.path)}`
    case "terminal":
      return "In the terminal"
    case "cloud":
      return "Viewing Cloud"
    case "history":
      return "Viewing History"
    case "info":
      return "Viewing Information"
    case "chat-agent":
      return "Writing a message to the agent"
    case "chat-team":
      return "Writing a message in Team chat"
    case "away":
      return "Away from the tab"
  }
}

// Lists everyone on the project, active people first with what they're doing.
// Inactive members are greyed out.
export function PeopleDialog({
  members,
  people,
  myUserId,
  onClose,
}: {
  members: ProjectMember[]
  people: PersonPresence[]
  myUserId: string
  onClose: () => void
}) {
  const live = new Map(people.map((p) => [p.userId, p]))
  const agent = live.get("forgeai-agent")
  const rows = [...members].sort(
    (a, b) => Number(live.has(b.id)) - Number(live.has(a.id)),
  )
  const activeCount =
    members.filter((m) => live.has(m.id)).length + (agent ? 1 : 0)
  const totalCount = members.length + (agent ? 1 : 0)

  return (
    <ModalShell
      title="People on this project"
      subtitle={`${activeCount} of ${totalCount} active now`}
      width="max-w-md"
      onClose={onClose}
    >
      {members.length === 0 && !agent ? (
        <p className="text-mute text-sm">Loading…</p>
      ) : (
        <ul className="divide-hairline -my-1 max-h-[60vh] divide-y overflow-y-auto">
          {agent && (
            <li className="flex items-center gap-3 py-2.5">
              <div className="relative shrink-0">
                <div className="bg-surface-card text-ink grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold">
                  FA
                </div>
                <span
                  aria-hidden
                  className="bg-success ring-canvas absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-ink truncate text-sm">ForgeAI agent</div>
                <div className="text-body truncate text-[11px]">
                  {describeActivity(agent)}
                </div>
              </div>
              <span className="text-mute shrink-0 text-[10px] tracking-wide uppercase">
                Agent
              </span>
            </li>
          )}
          {rows.map((member) => {
            const person = live.get(member.id)
            return (
              <li key={member.id} className="flex items-center gap-3 py-2.5">
                <div className="relative shrink-0">
                  <div className="bg-surface-card text-ink grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold">
                    {collaboratorInitials(member.name, member.email)}
                  </div>
                  <span
                    aria-hidden
                    className={`ring-canvas absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ${
                      person ? "bg-success" : "bg-stone"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-ink truncate text-sm">
                    {member.name || member.email}
                    {member.id === myUserId && (
                      <span className="text-mute"> (you)</span>
                    )}
                  </div>
                  <div
                    className={`truncate text-[11px] ${person ? "text-body" : "text-mute"}`}
                  >
                    {person ? describeActivity(person) : "Inactive"}
                  </div>
                </div>
                <span className="text-mute shrink-0 text-[10px] tracking-wide uppercase">
                  {ROLE_LABEL[member.role]}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </ModalShell>
  )
}
