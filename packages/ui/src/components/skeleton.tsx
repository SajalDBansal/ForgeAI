import { cn } from "@forgeAI/ui/lib/utils"

// Pulsing placeholder block.
// Shown while content is loading.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  )
}

export { Skeleton }
