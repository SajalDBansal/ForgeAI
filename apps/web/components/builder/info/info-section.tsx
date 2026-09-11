import type { ReactNode } from "react"

// A titled section in the Info tab.
// Wraps each block (brief, plan, requirements, ...) with a consistent heading.
export function InfoSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section>
      <h3 className="hairline-b mb-3 pb-2 text-base font-bold">{title}</h3>
      <div>{children}</div>
    </section>
  )
}
