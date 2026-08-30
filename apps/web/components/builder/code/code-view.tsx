import { highlight } from "@/components/builder/code/highlight"

export function CodeView({ code, fileKey }: { code: string; fileKey: string }) {
  const lines = code.split("\n")
  const addedSet = new Set<number>()
  if (fileKey === "src/components/Hero.tsx") {
    addedSet.add(3)
    addedSet.add(4)
    addedSet.add(5)
  }
  if (fileKey === "src/App.tsx") {
    addedSet.add(2)
  }

  return (
    <pre className="text-[12.5px] leading-[1.6] font-mono">
      {lines.map((l, i) => {
        const n = i + 1
        const added = addedSet.has(n)
        return (
          <div key={i} className={`flex ${added ? "bg-success/10" : ""}`}>
            <span className="select-none w-10 text-right pr-3 text-ash-dark-surface shrink-0">{n}</span>
            <span className="pr-4 whitespace-pre">{highlight(l)}</span>
          </div>
        )
      })}
    </pre>
  )
}
