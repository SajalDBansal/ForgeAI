"use client"

import { useState } from "react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@forgeAI/ui/components/select"

import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { Row } from "@/components/settings/row"

const THEMES = ["cream", "ink"] as const
const DENSITIES = ["comfy", "compact"] as const

export function AppearanceTab() {
  const [theme, setTheme] = useState<(typeof THEMES)[number]>("cream")
  const [density, setDensity] = useState<(typeof DENSITIES)[number]>("comfy")

  return (
    <PageCard className="p-5">
      <SectionHeader label="Appearance" />
      <Row label="Theme">
        <div className="grid grid-cols-2 gap-3 max-w-md">
          {THEMES.map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`border rounded-sm p-3 text-left ${theme === t ? "border-ink" : "border-hairline"}`}
            >
              <div
                className={`h-14 rounded-sm mb-2 ${t === "cream" ? "bg-canvas border border-hairline" : "bg-surface-dark"}`}
              />
              <div className="text-sm font-medium capitalize">{t}</div>
              <div className="text-[11px] text-mute">
                {t === "cream" ? "Daylight default" : "OLED-friendly"}
              </div>
            </button>
          ))}
        </div>
      </Row>
      <Row label="Density">
        <div className="flex gap-2">
          {DENSITIES.map((d) => (
            <button
              key={d}
              onClick={() => setDensity(d)}
              className={`h-8 px-3 text-xs rounded-sm border ${density === d ? "bg-ink text-on-primary border-ink" : "border-hairline"
                }`}
            >
              {d}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Font" hint="Monospace required">
        <Select defaultValue="JetBrains Mono">
          <SelectTrigger className="w-full h-9 rounded-sm border-hairline bg-canvas text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="JetBrains Mono">JetBrains Mono</SelectItem>
            <SelectItem value="IBM Plex Mono">IBM Plex Mono</SelectItem>
            <SelectItem value="Berkeley Mono">Berkeley Mono</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    </PageCard>
  )
}
