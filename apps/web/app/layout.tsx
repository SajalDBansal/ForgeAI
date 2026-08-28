import type { Metadata } from "next"

import "@forgeAI/ui/styles/webview.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@forgeAI/ui/components/tooltip"
import { Toaster } from "@forgeAI/ui/components/sonner"
// import { ShortcutsProvider } from "@/components/shortcuts-provider"
// import { AppMetadataProvider } from "@/components/app-metadata-provider"

export const metadata: Metadata = {
  title: "ForgeAI — the AI coding agent workspace",
  description:
    "Describe what you want to build. ForgeAI plans, scaffolds, and ships the frontend in a single workspace.",
  openGraph: {
    title: "ForgeAI",
    description: "An AI coding agent workspace for shipping frontends fast.",
    type: "website",
  },
  twitter: {
    card: "summary",
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- brand font is intentionally global, loaded once in the root layout, not per-page */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={200}>
            {/* <AppMetadataProvider> */}
            {children}
            {/* </AppMetadataProvider> */}
          </TooltipProvider>
          {/* <ShortcutsProvider /> */}
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
