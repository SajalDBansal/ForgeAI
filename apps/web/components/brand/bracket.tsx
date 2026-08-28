import { cn } from "@forgeAI/ui/lib/utils"

const MAP = { plus: "[+]", minus: "[-]", x: "[x]", dot: "[·]" } as const

export function Bracket({
  kind = "plus",
  className,
}: {
  kind?: keyof typeof MAP
  className?: string
}) {
  return <span className={cn("text-ink font-mono", className)}>{MAP[kind]}</span>
}
