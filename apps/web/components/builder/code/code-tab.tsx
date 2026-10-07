"use client"

import { AlertTriangle, Copy, FileText, X } from "lucide-react"

import type { PodState } from "@/hooks/use-ensure-pod"
import type { ProjectFiles } from "@/hooks/use-project-files"
import { displayToast } from "@/lib/toast"
import { SandboxBooting } from "@/components/builder/sandbox-booting"
import { FileTree } from "@/components/builder/code/file-tree"
import { Editor } from "@/components/builder/code/editor"
import {
  useSharedDocument,
  type SharedDocument,
} from "@/hooks/use-shared-document"
import { useFilePresence } from "@/hooks/use-file-presence"
import { PresenceLine } from "@/components/builder/code/presence-badges"
import { Terminal } from "@/components/builder/code/terminal"
import { BackupStatus } from "@/components/builder/code/backup-status"
import type { Backup } from "@/hooks/use-snapshot-status"

// Returns the file's save label for the status bar ("Saved 14:02", "Unsaved changes", …).
// "Saved" only follows a real write by the orchestrator; viewers see "Read-only".
function saveLabel(document: SharedDocument, canWrite: boolean): string {
  if (!canWrite) return "Read-only"
  if (document.conflict) return "Autosave paused"
  if (document.saveState === "unsaved") return "Unsaved changes"
  if (document.saveState === "saved" && document.savedAt) {
    return `Saved ${new Date(document.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
  }
  return "Up to date"
}

// Strip of open-file tabs; clicking selects a file, the X closes it.
// Sits above the editor.
function OpenFileTabs({
  openFiles,
  activeFile,
  setActiveFile,
  closeFile,
}: {
  openFiles: string[]
  activeFile: string
  setActiveFile: (f: string) => void
  closeFile: (f: string) => void
}) {
  return (
    <>
      {openFiles.map((f) => (
        <div
          key={f}
          className={`group border-hairline-strong/30 flex cursor-pointer items-center gap-2 border-r px-3 py-1.5 text-xs ${
            f === activeFile
              ? "bg-surface-dark-elevated text-on-dark-surface"
              : "text-ash-dark-surface hover:text-on-dark-surface"
          }`}
          onClick={() => setActiveFile(f)}
        >
          <FileText className="h-3 w-3" />
          <span className="whitespace-nowrap">{f.split("/").pop()}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              closeFile(f)
            }}
            className="opacity-50 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </>
  )
}

// Warning bar when the file changed or was deleted outside the editor during unsaved edits.
// Editors choose to keep their version or take the one on disk.
function ConflictBar({
  document,
  canWrite,
}: {
  document: SharedDocument
  canWrite: boolean
}) {
  if (!document.conflict) return null
  return (
    <div className="border-warning/40 bg-warning/10 text-warning flex items-center gap-3 border-b px-3 py-2 text-[11px]">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">
        {document.conflict === "removed"
          ? "This file was deleted outside the editor. Your version is still open here."
          : "This file changed outside the editor while you had unsaved edits."}{" "}
        <span className="text-ash-dark-surface">
          Autosave is paused until you choose.
        </span>
      </span>
      {canWrite && (
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <button
            onClick={() => document.resolve("mine")}
            className="border-warning/50 hover:bg-warning/20 rounded border px-2 py-0.5"
          >
            Keep mine
          </button>
          <button
            onClick={() => document.resolve("disk")}
            className="border-hairline-strong/40 text-ash-dark-surface hover:text-on-dark-surface rounded border px-2 py-0.5"
          >
            {document.conflict === "removed"
              ? "Discard mine"
              : "Use the file on disk"}
          </button>
        </span>
      )}
    </div>
  )
}

// The editor pane: a prompt to pick a file, an error, a loading note, or the Monaco editor.
// Read-only for viewers.
function EditorArea({
  activeFile,
  document,
  canWrite,
}: {
  activeFile: string
  document: SharedDocument
  canWrite: boolean
}) {
  return (
    <div className="min-h-0 flex-1">
      {!activeFile ? (
        <div className="text-ash-dark-surface/60 grid h-full place-items-center text-[11px]">
          Choose a file to start editing.
        </div>
      ) : document.error ? (
        <div className="text-warning grid h-full place-items-center px-6 text-center text-[11px]">
          {document.error}
        </div>
      ) : document.text ? (
        <Editor
          path={activeFile}
          text={document.text}
          readOnly={!canWrite}
          onSave={document.save}
        />
      ) : (
        <div className="text-ash-dark-surface/60 grid h-full place-items-center text-[11px]">
          opening…
        </div>
      )}
    </div>
  )
}

// Code tab: file explorer, open-file tabs, shared editor, terminal and status bar.
// Waits for the sandbox; viewers get a read-only editor.
export function CodeTab({
  activeFile,
  setActiveFile,
  openFiles,
  closeFile,
  pod,
  onRetryPod,
  files,
  projectId,
  canWrite,
  backup,
}: {
  activeFile: string
  setActiveFile: (f: string) => void
  openFiles: string[]
  closeFile: (f: string) => void
  pod: PodState
  onRetryPod: () => void
  files: ProjectFiles
  projectId: string
  /** False for viewers, who get the same document read-only. */
  canWrite: boolean
  /** Cloud save status, shown beside the file's own save state. */
  backup: Backup
}) {
  // Called unconditionally (hooks rule); it simply waits until there is a sandbox.
  const document = useSharedDocument(
    projectId,
    activeFile,
    canWrite,
    pod.status === "ready" ? pod.pod.sandboxId : null,
  )

  // One subscription for the whole tab, handed down to the tree and tabs.
  const presence = useFilePresence(projectId)

  if (pod.status !== "ready") {
    return (
      <div className="bg-surface-dark text-on-dark-surface flex min-h-0 flex-1">
        <SandboxBooting state={pod} onRetry={onRetryPod} onDark />
      </div>
    )
  }

  return (
    <div className="bg-surface-dark text-on-dark-surface flex min-h-0 flex-1">
      <aside className="border-hairline-strong/30 dark-scroll w-56 shrink-0 overflow-y-auto border-r">
        <div className="text-ash-dark-surface px-3 py-2 text-[11px] tracking-widest uppercase">
          Explorer
        </div>
        {files.error ? (
          <p className="text-warning px-3 py-2 text-[11px]">{files.error}</p>
        ) : (
          <FileTree
            files={files}
            folder=""
            activeFile={activeFile}
            onSelect={setActiveFile}
            viewersOf={presence.viewersOf}
          />
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-hairline-strong/30 dark-scroll flex overflow-x-auto border-b">
          <OpenFileTabs
            openFiles={openFiles}
            activeFile={activeFile}
            setActiveFile={setActiveFile}
            closeFile={closeFile}
          />
          <div className="text-ash-dark-surface ml-auto flex items-center gap-3 px-2">
            {/* Who else is on the open file. */}
            <PresenceLine people={presence.viewersOf(activeFile)} />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(document.text?.toString() ?? "")
                displayToast("Copied to clipboard")
              }}
              className="hover:text-on-dark-surface flex h-7 items-center gap-1 px-2 text-[11px]"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
        </div>

        <ConflictBar document={document} canWrite={canWrite} />

        <EditorArea
          activeFile={activeFile}
          document={document}
          canWrite={canWrite}
        />

        {/* Marks the terminal for presence: focus inside it reads as "in the terminal". */}
        <div data-activity="terminal" className="contents">
          <Terminal />
        </div>

        <div className="border-hairline-strong/30 bg-surface-dark-elevated text-ash-dark-surface flex items-center gap-3 border-t px-3 py-1 text-[11px]">
          <span>UTF-8</span>
          <span>·</span>
          <span>LF</span>
          {/* Whether the file itself is saved to the sandbox. */}
          <span className="ml-auto">{saveLabel(document, canWrite)}</span>
          <span>·</span>
          {/* Whether the project is saved to cloud storage (a separate save). */}
          <BackupStatus backup={backup} canWrite={canWrite} />
        </div>
      </div>
    </div>
  )
}
