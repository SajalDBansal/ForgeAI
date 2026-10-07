"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  PREVIEW_IFRAME_REFERRER_POLICY,
  PROXIED_PREVIEW_IFRAME_SANDBOX,
} from "@forgeAI/shared/lib/content-isolation"
import {
  ExternalLink,
  Link2,
  Link2Off,
  Monitor,
  Play,
  RefreshCw,
  Smartphone,
  Tablet,
  TerminalSquare,
  TriangleAlert,
} from "lucide-react"

import type { PodState } from "@/hooks/use-ensure-pod"
import type { DevServer } from "@/hooks/use-dev-server"
import { useUserName } from "@/hooks/use-user-name"
import type { PreviewLinkStatus } from "@/lib/types"
import { PUBLIC_ENV } from "@/lib/env"
import {
  createGlobalPreviewLinkRequest,
  getPreviewLinkStatusRequest,
  stopGlobalPreviewLinkRequest,
} from "@/lib/sandbox"
import {
  ModalShell,
  btnGhost,
  btnPrimary,
} from "@/components/modal/modal-shell"
import { SandboxBooting } from "@/components/builder/sandbox-booting"
import { PreviewSkeleton } from "@/components/builder/preview/preview-skeleton"

type Device = "desktop" | "tablet" | "mobile"

const WIDTH_MAP: Record<Device, string> = {
  desktop: "w-full max-w-[1100px]",
  tablet: "w-[820px] max-w-full",
  mobile: "w-[390px]",
}

// Preview toolbar: refresh, the preview URL, device-width switch and "open in new tab".
// Refresh and open are disabled until the dev server is live.
function PreviewToolbar({
  live,
  loading,
  previewUrl,
  device,
  setDevice,
  onRefresh,
  canManageGlobal,
  globalEnabled,
  globalBusy,
  onCreateGlobal,
  onStopGlobal,
}: {
  live: boolean
  loading: boolean
  previewUrl: string | undefined
  device: Device
  setDevice: (d: Device) => void
  onRefresh: () => void
  canManageGlobal: boolean
  globalEnabled: boolean
  globalBusy: boolean
  onCreateGlobal: () => void
  onStopGlobal: () => void
}) {
  return (
    <div className="hairline-b bg-canvas flex items-center gap-2 px-3 py-2">
      <button
        onClick={onRefresh}
        disabled={!live}
        className="text-mute hover:text-ink hover:bg-surface-soft grid h-7 w-7 place-items-center rounded-sm disabled:opacity-40 disabled:hover:bg-transparent"
        title="Refresh"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${live && loading ? "animate-spin" : ""}`}
        />
      </button>

      <div className="max-w-xl flex-1">
        <div className="bg-surface-soft text-body border-hairline flex h-7 items-center gap-2 rounded-sm border px-3 text-[12px]">
          {previewUrl ? (
            <span className="truncate font-mono text-[11px]">{previewUrl}</span>
          ) : (
            <span className="text-mute">No dev server running</span>
          )}
        </div>
      </div>

      <div className="border-hairline flex overflow-hidden rounded-sm border">
        {(["desktop", "tablet", "mobile"] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDevice(d)}
            className={`grid h-7 w-8 place-items-center ${device === d ? "bg-ink text-on-primary" : "text-mute hover:text-ink"}`}
            title={d}
          >
            {d === "desktop" && <Monitor className="h-3.5 w-3.5" />}
            {d === "tablet" && <Tablet className="h-3.5 w-3.5" />}
            {d === "mobile" && <Smartphone className="h-3.5 w-3.5" />}
          </button>
        ))}
      </div>

      {live && canManageGlobal && (
        <button
          onClick={globalEnabled ? onStopGlobal : onCreateGlobal}
          disabled={globalBusy}
          className="border-hairline hover:bg-surface-soft inline-flex h-7 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium disabled:opacity-50"
          title={globalEnabled ? "Stop global link" : "Create global link"}
        >
          {globalEnabled ? (
            <Link2Off className="h-3.5 w-3.5" />
          ) : (
            <Link2 className="h-3.5 w-3.5" />
          )}
          <span className="hidden whitespace-nowrap sm:inline">
            {globalEnabled ? "Stop global link" : "Create global link"}
          </span>
        </button>
      )}

      <a
        href={previewUrl ?? "#"}
        target="_blank"
        rel="noreferrer noopener"
        aria-disabled={!live}
        onClick={(e) => {
          if (!live) e.preventDefault()
        }}
        className="text-mute hover:text-ink hover:bg-surface-soft grid h-7 w-7 place-items-center rounded-sm aria-disabled:opacity-40 aria-disabled:hover:bg-transparent"
        title="Open in a new tab"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

// Preview tab: the live app in a device-sized iframe, or the dev server's status panel.
// Waits for the sandbox before showing anything.
export function PreviewTab({
  projectId,
  device,
  setDevice,
  previewState,
  setPreviewState,
  pod,
  onRetryPod,
  dev,
  canWrite,
  onOpenTerminal,
}: {
  projectId: string
  device: Device
  setDevice: (d: Device) => void
  previewState: "loading" | "ready"
  setPreviewState: (s: "loading" | "ready") => void
  pod: PodState
  onRetryPod: () => void
  dev: DevServer
  canWrite: boolean
  /** Switches to the Code tab, where the terminal is. */
  onOpenTerminal: () => void
}) {
  // Bumped to remount the iframe (a cross-origin frame can't be reloaded directly).
  const [reloads, setReloads] = useState(0)
  const [sharing, setSharing] = useState<PreviewLinkStatus | null>(null)
  const [sharingBusy, setSharingBusy] = useState(false)
  const [globalDialogOpen, setGlobalDialogOpen] = useState(false)
  const fallbackPreviewUrl = useMemo(
    () =>
      `${PUBLIC_ENV.AUTH_URL}/api/v1/preview/project/${encodeURIComponent(projectId)}/`,
    [projectId],
  )
  const devLive = dev.state === "live"
  const projectPreviewPath = `/project/${encodeURIComponent(projectId)}/`
  const currentSharing = sharing?.previewUrl.includes(projectPreviewPath)
    ? sharing
    : null
  const previewUrl = devLive
    ? (currentSharing?.previewUrl ?? fallbackPreviewUrl)
    : undefined
  const blockedPreview = devLive && currentSharing?.devLive === false
  const panelDev = blockedPreview
    ? {
        ...dev,
        state: "error" as const,
        previewUrl: undefined,
        message: "The preview proxy cannot reach a trusted live sandbox URL.",
      }
    : dev
  const live = devLive && !!previewUrl && !blockedPreview
  const failed =
    blockedPreview || dev.state === "error" || dev.state === "crashed"

  useEffect(() => {
    if (!devLive) return

    let current = true
    void (async () => {
      const result = await getPreviewLinkStatusRequest(projectId)
      if (!current) return
      if (result.ok) setSharing(result.data)
    })()
    return () => {
      current = false
    }
  }, [projectId, devLive])

  if (pod.status !== "ready")
    return <SandboxBooting state={pod} onRetry={onRetryPod} />

  // Reloads the preview iframe.
  const refresh = () => {
    if (!live) return
    setPreviewState("loading")
    setReloads((n) => n + 1)
  }

  const createGlobalLink = async () => {
    if (sharingBusy) return
    setSharingBusy(true)
    const result = await createGlobalPreviewLinkRequest(projectId)
    setSharingBusy(false)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    setSharing(result.data)
    setGlobalDialogOpen(false)
    if (result.data.globalUrl) {
      await navigator.clipboard
        ?.writeText(result.data.globalUrl)
        .catch(() => undefined)
    }
    toast.success("Global preview link is live")
  }

  const stopGlobalLink = async () => {
    if (sharingBusy) return
    setSharingBusy(true)
    const result = await stopGlobalPreviewLinkRequest(projectId)
    setSharingBusy(false)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    setSharing(result.data)
    toast.success("Global preview link stopped")
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PreviewToolbar
        live={live}
        loading={previewState === "loading"}
        previewUrl={previewUrl}
        device={device}
        setDevice={setDevice}
        onRefresh={refresh}
        canManageGlobal={canWrite}
        globalEnabled={currentSharing?.globalEnabled ?? false}
        globalBusy={sharingBusy}
        onCreateGlobal={() => setGlobalDialogOpen(true)}
        onStopGlobal={stopGlobalLink}
      />

      {/* Flex so the iframe stretches to the tab's height. */}
      {live ? (
        <div className="bg-surface-soft flex min-h-0 flex-1 justify-center overflow-auto p-4 md:p-8">
          <div
            className={`${WIDTH_MAP[device]} bg-canvas border-hairline relative h-full overflow-hidden rounded-sm border`}
          >
            <iframe
              // Remount on refresh and whenever the URL changes.
              key={`${previewUrl}-${reloads}`}
              src={previewUrl}
              title="Preview"
              sandbox={PROXIED_PREVIEW_IFRAME_SANDBOX}
              referrerPolicy={PREVIEW_IFRAME_REFERRER_POLICY}
              onLoad={() => setPreviewState("ready")}
              className="bg-canvas h-full w-full border-0"
            />
            {/* Overlaid, since an unmounted iframe would never fire onLoad. */}
            {previewState === "loading" && (
              <div className="bg-canvas absolute inset-0">
                <PreviewSkeleton />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-surface-soft grid flex-1 place-items-center overflow-auto p-6">
          <DevServerPanel
            dev={panelDev}
            canWrite={canWrite}
            failed={failed}
            onOpenTerminal={onOpenTerminal}
          />
        </div>
      )}
      {globalDialogOpen && (
        <CreateGlobalLinkDialog
          busy={sharingBusy}
          onCreate={createGlobalLink}
          onClose={() => setGlobalDialogOpen(false)}
        />
      )}
    </div>
  )
}

function CreateGlobalLinkDialog({
  busy,
  onCreate,
  onClose,
}: {
  busy: boolean
  onCreate: () => void
  onClose: () => void
}) {
  return (
    <ModalShell
      title="Create global link"
      subtitle="This creates a public preview URL anyone can open while the sandbox dev server is running. ForgeAI keeps the same URL and proxies it to the current live sandbox behind the scenes."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onCreate}
            disabled={busy}
            className={`${btnPrimary} disabled:opacity-50`}
          >
            {busy ? "Creating..." : "Create link"}
          </button>
        </>
      }
    >
      <p className="text-body text-sm">
        The link does not expose the raw E2B address. When you stop the global
        link, the URL stops working even if the dev server keeps running.
      </p>
    </ModalShell>
  )
}

// What the Preview tab shows without a live app: the build log, the failure reason, or a Start button.
// Never an empty frame.
function DevServerPanel({
  dev,
  canWrite,
  failed,
  onOpenTerminal,
}: {
  dev: DevServer
  canWrite: boolean
  failed: boolean
  onOpenTerminal: () => void
}) {
  const nameFor = useUserName()
  const starter = nameFor(dev.startedBy)

  if (dev.state === "starting") {
    return (
      <div className="w-full max-w-2xl">
        {/* Say who started it, since it changes everyone's screen. */}
        <p className="text-body mb-3 text-sm">
          {starter && starter !== "you"
            ? `${starter} started the dev server…`
            : "Starting the dev server…"}
        </p>
        <LogPane lines={dev.logs} placeholder="Waiting for output…" />
      </div>
    )
  }

  if (failed) {
    return (
      <div className="w-full max-w-2xl">
        <div className="mb-3 flex items-start gap-2">
          <TriangleAlert className="text-warning mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-ink text-sm">
              {dev.state === "crashed"
                ? "The dev server stopped on its own."
                : "The dev server didn't start."}
            </p>
            {/* The full failure reason. */}
            {dev.message && (
              <p className="text-body mt-1 font-mono text-xs break-words whitespace-pre-wrap">
                {dev.message}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <button
              onClick={dev.openDialog}
              className="border-hairline hover:bg-surface-soft inline-flex h-8 items-center gap-1.5 rounded-sm border px-3 text-xs font-medium"
            >
              <Play className="h-3 w-3" /> Edit command and retry
            </button>
          )}

          <button
            onClick={onOpenTerminal}
            className="border-hairline hover:bg-surface-soft inline-flex h-8 items-center gap-1.5 rounded-sm border px-3 text-xs font-medium"
          >
            <TerminalSquare className="h-3 w-3" /> Open the terminal
          </button>
        </div>
        {dev.logs.length > 0 && (
          <div className="mt-4">
            <LogPane lines={dev.logs} placeholder="" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-sm text-center">
      <p className="text-ink text-sm">Nothing is running yet.</p>
      <p className="text-mute mt-1 text-xs">
        Your code is in the sandbox — start the dev server to see it running
        here.
      </p>
      {canWrite && (
        <button
          onClick={dev.openDialog}
          className="bg-ink text-on-primary hover:bg-ink-deep mt-4 inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-xs font-medium"
        >
          <Play className="h-3 w-3" /> Start dev server
        </button>
      )}
    </div>
  )
}

// Dark scrolling box showing dev-server output lines.
// Shows `placeholder` until output arrives.
function LogPane({
  lines,
  placeholder,
}: {
  lines: string[]
  placeholder: string
}) {
  return (
    <pre className="bg-surface-dark text-on-dark-surface max-h-72 overflow-auto rounded-sm p-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
      {lines.length ? lines.join("\n") : placeholder}
    </pre>
  )
}
