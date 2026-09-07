import type { ReactNode } from "react"

// Centered empty-state message with optional icon and action.
// Used when a list has nothing to show.
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      {icon && <div className="text-mute">{icon}</div>}
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        {description && (
          <p className="text-body mx-auto mt-1 max-w-sm text-sm">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
