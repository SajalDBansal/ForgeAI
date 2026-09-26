"use client"

import { useState, type FormEvent } from "react"

import {
  ModalShell,
  btnGhost,
  btnPrimary,
} from "@/components/modal/modal-shell"
import { GithubVersionsHint } from "@/components/github/github-versions-hint"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@forgeAI/ui/components/select"
import { useAppStore } from "@/lib/store"
import { useStartProject } from "@/hooks/use-start-project"

// Dialog that creates a project from a name and a template, without a prompt.
// Opened from the home composer and from a workspace's "Add project".
export function CreateEmptyProjectDialog({
  workspaceId,
  onClose,
}: {
  /** Target workspace; omitted on the home screen (the server uses the base workspace). */
  workspaceId?: string
  onClose: () => void
}) {
  const templates = useAppStore((s) => s.templates)
  const startProject = useStartProject()
  const [name, setName] = useState("")
  const [templateId, setTemplateId] = useState<string | undefined>(undefined)
  const [creating, setCreating] = useState(false)

  const canSubmit = name.trim().length > 0 && !!templateId && !creating

  // Creates the project and closes the dialog on success.
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !templateId) return

    setCreating(true)
    const created = await startProject({
      mode: "BUILD",
      source: "MANUAL",
      name: name.trim(),
      templateId,
      workspaceId,
    })
    setCreating(false)
    if (created) onClose()
  }

  return (
    <ModalShell
      title="Create empty project"
      subtitle="Name your project and pick a template to start from — no prompt needed."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button
            type="submit"
            form="create-empty-project-form"
            disabled={!canSubmit}
            className={`${btnPrimary} disabled:opacity-50`}
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </>
      }
    >
      <form
        id="create-empty-project-form"
        onSubmit={submit}
        className="space-y-4"
      >
        <label className="block">
          <div className="text-mute mb-1.5 text-[11px] tracking-widest uppercase">
            Project name
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
            placeholder="my-app"
            className="bg-canvas border-hairline focus:border-ink h-10 w-full rounded-sm border px-3 text-sm focus:outline-none"
          />
        </label>

        <label className="block">
          <div className="text-mute mb-1.5 text-[11px] tracking-widest uppercase">
            Template
          </div>
          {templates.length === 0 ? (
            <p className="text-mute text-sm">No templates available yet.</p>
          ) : (
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="border-hairline bg-canvas h-10 w-full rounded-sm text-sm">
                <SelectValue placeholder="Select a template…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    <span className="text-mute ml-1.5">· {t.tag}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </label>
        <GithubVersionsHint />
      </form>
    </ModalShell>
  )
}
