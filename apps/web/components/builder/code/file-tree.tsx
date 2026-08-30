"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from "lucide-react"

export interface FileNode {
  file?: string
  dir?: string
  children?: FileNode[]
}

export function FileTree({
  nodes,
  path,
  activeFile,
  onSelect,
  depth = 0,
}: {
  nodes: FileNode[]
  path: string
  activeFile: string
  onSelect: (f: string) => void
  depth?: number
}) {
  return (
    <ul className="text-[12px]">
      {nodes.map((n, i) => {
        if (n.dir) {
          const full = path ? `${path}/${n.dir}` : n.dir
          return <DirRow key={i} node={n} full={full} activeFile={activeFile} onSelect={onSelect} depth={depth} />
        }
        const full = path ? `${path}/${n.file}` : n.file!
        const isActive = full === activeFile
        return (
          <li key={i}>
            <button
              onClick={() => onSelect(full)}
              className={`w-full text-left flex items-center gap-2 py-0.5 pr-2 ${isActive ? "bg-surface-dark-elevated text-on-dark-surface" : "text-ash-dark-surface hover:text-on-dark-surface"}`}
              style={{ paddingLeft: 8 + depth * 12 }}
            >
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate">{n.file}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function DirRow({
  node,
  full,
  activeFile,
  onSelect,
  depth,
}: {
  node: FileNode
  full: string
  activeFile: string
  onSelect: (f: string) => void
  depth: number
}) {
  const [open, setOpen] = useState(true)
  return (
    <li>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left flex items-center gap-1.5 py-0.5 text-ash-dark-surface hover:text-on-dark-surface"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {open ? <FolderOpen className="h-3 w-3" /> : <Folder className="h-3 w-3" />}
        <span>{node.dir}</span>
      </button>
      {open && node.children && (
        <FileTree nodes={node.children} path={full} activeFile={activeFile} onSelect={onSelect} depth={depth + 1} />
      )}
    </li>
  )
}
