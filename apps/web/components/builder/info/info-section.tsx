import type { ReactNode } from "react"

export function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-base font-bold hairline-b pb-2 mb-3">{title}</h3>
      <div>{children}</div>
    </section>
  )
}
