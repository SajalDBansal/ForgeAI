import type { ReactNode } from "react"

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
    <div className="py-16 px-6 flex flex-col items-center gap-3 text-center">
      {icon && <div className="text-mute">{icon}</div>}
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        {description && <p className="mt-1 text-sm text-body max-w-sm mx-auto">{description}</p>}
      </div>
      {action}
    </div>
  )
}
