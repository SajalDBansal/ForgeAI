"use client"

import { useRouter } from "next/navigation"
import { Download, Sparkles } from "lucide-react"

import { SESSION_KEYS } from "@/lib/builder-data"
import { displayToast } from "@/lib/toast"

export function useTemplatePrompt(name: string, description: string) {
  const router = useRouter()

  return function useTemplate() {
    sessionStorage.setItem(SESSION_KEYS.prompt, `Use the ${name} template: ${description}`)
    router.push("/new")
  }
}

export function TemplateHeaderActions({
  name,
  description,
}: {
  name: string
  description: string
}) {
  const useTemplate = useTemplatePrompt(name, description)

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => displayToast("Downloading the template source isn't available yet.")}
        className="h-9 px-4 border border-hairline rounded-sm text-sm font-medium hover:bg-surface-soft inline-flex items-center gap-2"
      >
        <Download className="h-3.5 w-3.5" /> Source
      </button>
      <button
        onClick={useTemplate}
        className="h-9 px-4 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep inline-flex items-center gap-2"
      >
        <Sparkles className="h-3.5 w-3.5" /> Use template
      </button>
    </div>
  )
}

export function TemplateFooterAction({
  name,
  description,
}: {
  name: string
  description: string
}) {
  const useTemplate = useTemplatePrompt(name, description)

  return (
    <button
      onClick={useTemplate}
      className="h-9 px-5 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep inline-flex items-center gap-2"
    >
      <Sparkles className="h-3.5 w-3.5" /> Use template — open builder
    </button>
  )
}
