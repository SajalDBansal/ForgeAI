"use client"

import { ExternalLink, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react"

import { displayToast } from "@/lib/toast"
import { PreviewSkeleton } from "@/components/builder/preview/preview-skeleton"
import { MockSite } from "@/components/builder/preview/mock-site"

type Device = "desktop" | "tablet" | "mobile"

const WIDTH_MAP: Record<Device, string> = {
  desktop: "w-full max-w-[1100px]",
  tablet: "w-[820px] max-w-full",
  mobile: "w-[390px]",
}

export function PreviewTab({
  device,
  setDevice,
  previewState,
  setPreviewState,
  projectName,
}: {
  device: Device
  setDevice: (d: Device) => void
  previewState: "loading" | "ready"
  setPreviewState: (s: "loading" | "ready") => void
  projectName: string
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="hairline-b px-3 py-2 bg-canvas flex items-center gap-2">
        <button
          onClick={() => {
            setPreviewState("loading")
            setTimeout(() => setPreviewState("ready"), 900)
          }}
          className="h-7 w-7 grid place-items-center text-mute hover:text-ink hover:bg-surface-soft rounded-sm"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${previewState === "loading" ? "animate-spin" : ""}`} />
        </button>
        <div className="flex-1 max-w-xl">
          <div className="h-7 px-3 bg-surface-soft text-[12px] text-body rounded-sm border border-hairline flex items-center gap-2">
            <span className="text-mute">https://</span>
            <span className="truncate">preview.local/{projectName}</span>
            <span className="ml-auto text-mute text-[10px]">[ mock ]</span>
          </div>
        </div>
        <div className="flex border border-hairline rounded-sm overflow-hidden">
          {(["desktop", "tablet", "mobile"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={`h-7 w-8 grid place-items-center ${device === d ? "bg-ink text-on-primary" : "text-mute hover:text-ink"}`}
              title={d}
            >
              {d === "desktop" && <Monitor className="h-3.5 w-3.5" />}
              {d === "tablet" && <Tablet className="h-3.5 w-3.5" />}
              {d === "mobile" && <Smartphone className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
        <button
          onClick={() => displayToast("Open external (mock)")}
          className="h-7 w-7 grid place-items-center text-mute hover:text-ink hover:bg-surface-soft rounded-sm"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-surface-soft p-4 md:p-8 grid place-items-start justify-center">
        <div className={`${WIDTH_MAP[device]} bg-canvas border border-hairline shadow-none rounded-sm overflow-hidden`}>
          {previewState === "loading" ? <PreviewSkeleton /> : <MockSite device={device} />}
        </div>
      </div>
    </div>
  )
}
