"use client"

import { collaboratorInitials } from "@/lib/types"
import type { PresentPerson } from "@/hooks/use-file-presence"

// Small initials badges for people on a file (accent ring = typing), plus "+N" overflow.
// Full names are in the tooltip.
export function PresenceBadges({
  people,
  max = 3,
}: {
  people: PresentPerson[]
  max?: number
}) {
  if (people.length === 0) return null

  const shown = people.slice(0, max)
  const extra = people.length - shown.length

  return (
    <span className="flex shrink-0 items-center -space-x-1">
      {shown.map((person) => (
        <span
          key={person.userId}
          title={
            person.editing
              ? `${person.name} is editing this file`
              : `${person.name} has this file open`
          }
          className={`grid h-4 w-4 place-items-center rounded-full text-[8px] font-medium ring-1 ${
            person.editing
              ? "bg-accent text-accent-foreground ring-accent"
              : "bg-surface-dark-elevated text-ash-dark-surface ring-hairline-strong/40"
          }`}
        >
          {collaboratorInitials(person.name, person.name)}
        </span>
      ))}
      {extra > 0 && (
        <span className="text-ash-dark-surface pl-1.5 text-[9px]">
          +{extra}
        </span>
      )}
    </span>
  )
}

// Joins names as "A", "A and B", or "A and N others".
// Keeps the presence sentence short.
function joinNames(people: PresentPerson[]): string {
  if (people.length === 1) return people[0]!.name
  if (people.length === 2) return `${people[0]!.name} and ${people[1]!.name}`
  return `${people[0]!.name} and ${people.length - 1} others`
}

// "Grace is editing" / "Ann and Bo are viewing", for the file open in the editor.
// Editors take precedence over viewers in the sentence.
export function PresenceLine({ people }: { people: PresentPerson[] }) {
  if (people.length === 0) return null

  const editing = people.filter((person) => person.editing)
  const subject = editing.length ? editing : people
  const verb = editing.length ? "editing" : "viewing"

  const names = joinNames(subject)

  return (
    <span
      className={`text-[11px] whitespace-nowrap ${editing.length ? "text-accent" : "text-ash-dark-surface"}`}
      title={people.map((person) => person.name).join(", ")}
    >
      {names} {subject.length === 1 ? "is" : "are"} {verb}
    </span>
  )
}
