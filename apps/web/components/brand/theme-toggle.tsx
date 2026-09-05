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

// Button that switches between light and dark mode.
// Shows a neutral icon until mounted, since the theme is unknown on the server.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard: the theme is unknown on the server.
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
          className="border-hairline text-body hover:bg-surface-soft hover:text-ink rounded-sm"
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isDark ? "Switch to light mode" : "Switch to dark mode"}
      </TooltipContent>
    </Tooltip>
  )
}
