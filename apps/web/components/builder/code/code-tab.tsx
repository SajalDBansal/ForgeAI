"use client"

import { Copy, FileText, Play, X } from "lucide-react"

import { displayToast } from "@/lib/toast"
import { FileTree, type FileNode } from "@/components/builder/code/file-tree"
import { CodeView } from "@/components/builder/code/code-view"
import { Terminal } from "@/components/builder/code/terminal"

const FILE_TREE: FileNode[] = []
const FILES: Record<string, string> = {}

export function CodeTab({
  activeFile,
  setActiveFile,
  openFiles,
  closeFile,
}: {
  activeFile: string
  setActiveFile: (f: string) => void
  openFiles: string[]
  closeFile: (f: string) => void
}) {
  const code = FILES[activeFile] ?? (activeFile ? `// ${activeFile}` : "")

  return (
    <div className="flex-1 flex min-h-0 bg-surface-dark text-on-dark-surface">
      <aside className="w-56 shrink-0 border-r border-hairline-strong/30 overflow-y-auto dark-scroll">
        <div className="px-3 py-2 text-[11px] text-ash-dark-surface uppercase tracking-widest">Explorer</div>
        <FileTree nodes={FILE_TREE} path="" activeFile={activeFile} onSelect={setActiveFile} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex border-b border-hairline-strong/30 overflow-x-auto dark-scroll">
          {openFiles.map((f) => (
            <div
              key={f}
              className={`group flex items-center gap-2 px-3 py-1.5 text-xs border-r border-hairline-strong/30 cursor-pointer ${f === activeFile ? "bg-surface-dark-elevated text-on-dark-surface" : "text-ash-dark-surface hover:text-on-dark-surface"
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
          <div className="ml-auto flex items-center gap-1 px-2 text-ash-dark-surface">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(code)
                displayToast("Copied to clipboard")
              }}
              className="h-7 px-2 text-[11px] hover:text-on-dark-surface flex items-center gap-1"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
            <button onClick={() => displayToast("Saved")} className="h-7 px-2 text-[11px] hover:text-on-dark-surface">
              Save
            </button>
            <button onClick={() => displayToast("Run")} className="h-7 px-2 text-[11px] hover:text-on-dark-surface flex items-center gap-1">
              <Play className="h-3 w-3" /> Run
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto dark-scroll min-h-0">
          <CodeView code={code} fileKey={activeFile} />
        </div>

        <Terminal />

        <div className="border-t border-hairline-strong/30 bg-surface-dark-elevated px-3 py-1 text-[11px] text-ash-dark-surface flex items-center gap-3">
          <span>tsx</span>
          <span>·</span>
          <span>UTF-8</span>
          <span>·</span>
          <span>LF</span>
          <span className="ml-auto">Ln 1, Col 1 · spaces: 2</span>
        </div>
      </div>
    </div>
  )
}
