import type { Project } from "@/lib/types"

// Lists the projects a workspace action will also affect.
// Shown in archive and delete dialogs so nothing is affected silently.
export function AffectedProjects({
  projects,
  verb,
}: {
  projects: Project[]
  verb: string
}) {
  if (projects.length === 0) return null

  return (
    <div className="hairline-t mt-3 pt-3">
      <p className="text-body text-sm">
        {projects.length === 1
          ? "This project"
          : `All ${projects.length} projects`}{" "}
        inside it {projects.length === 1 ? "is" : "are"} {verb} too:
      </p>
      <ul className="text-body mt-2 max-h-40 overflow-auto text-sm">
        {projects.map((p) => (
          <li key={p.id} className="flex items-center gap-2 py-1">
            <span className="text-mute shrink-0">·</span>
            <span className="truncate">{p.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
