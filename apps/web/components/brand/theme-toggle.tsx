"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"

import { Button } from "@forgeAI/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@forgeAI/ui/components/tooltip"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- next-themes hydration guard: resolvedTheme is unknown on the server, so the real icon can only be committed after mount.
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === "dark"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Toggle dark mode"
          className="border-hairline rounded-sm text-body hover:bg-surface-soft hover:text-ink"
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isDark ? "Switch to light mode" : "Switch to dark mode"}</TooltipContent>
    </Tooltip>
  )
}
