"use client"

import { useState } from "react"
import { Download, Loader2, Sparkles } from "lucide-react"

import { useStartProject } from "@/hooks/use-start-project"
import { templateDownloadRequest } from "@/lib/template-client"
import { displayToast } from "@/lib/toast"

// Returns a function that creates a project from this template and opens it.
// The server names it and writes the opening prompt, so nothing is asked of the user.
export function useStartFromTemplate(templateId: string) {
  const startProject = useStartProject()

  return function startFromTemplate() {
    void startProject({ mode: "BUILD", source: "MANUAL", templateId })
  }
}

// Downloads a template's source zip via a short-lived signed R2 link.
// Tracks `pending` so the button can show progress.
function useTemplateDownload(templateId: string) {
  const [pending, setPending] = useState(false)

  // Requests the signed link, then clicks a temporary anchor to start the download.
  async function download() {
    if (pending) return
    setPending(true)
    const result = await templateDownloadRequest(templateId)
    setPending(false)

    if (!result.ok) {
      displayToast(result.message)
      return
    }

    const link = document.createElement("a")
    link.href = result.data.url
    link.download = result.data.filename
    link.click()
  }

  return { download: () => void download(), pending }
}

// Download and "Use template" buttons for the template detail header.
// Download shows a spinner while the link is prepared.
export function TemplateHeaderActions({ templateId }: { templateId: string }) {
  const startFromTemplate = useStartFromTemplate(templateId)
  const { download, pending } = useTemplateDownload(templateId)

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={download}
        disabled={pending}
        className="border-hairline hover:bg-surface-soft inline-flex h-9 items-center gap-2 rounded-sm border px-4 text-sm font-medium disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {pending ? "Preparing…" : "Download"}
      </button>
      <button
        onClick={startFromTemplate}
        className="bg-ink text-on-primary hover:bg-ink-deep inline-flex h-9 items-center gap-2 rounded-sm px-4 text-sm font-medium"
      >
        <Sparkles className="h-3.5 w-3.5" /> Use template
      </button>
    </div>
  )
}

// "Use template — open builder" button at the bottom of the template page.
// Creates the project and navigates to it.
export function TemplateFooterAction({ templateId }: { templateId: string }) {
  const startFromTemplate = useStartFromTemplate(templateId)

  return (
    <button
      onClick={startFromTemplate}
      className="bg-ink text-on-primary hover:bg-ink-deep inline-flex h-9 items-center gap-2 rounded-sm px-5 text-sm font-medium"
    >
      <Sparkles className="h-3.5 w-3.5" /> Use template — open builder
    </button>
  )
}
