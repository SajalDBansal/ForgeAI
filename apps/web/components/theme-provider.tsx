"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

// Wraps next-themes' provider for light/dark mode.
// Mounted once in the root layout.
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
