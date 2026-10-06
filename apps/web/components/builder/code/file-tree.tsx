"use client"

import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  MoreHorizontal,
} from "lucide-react"

import type { IgnoredFolderKind } from "@forgeAI/shared"

import type { PodFile } from "@/lib/types"
import type { ProjectFiles } from "@/hooks/use-project-files"
import type { PresentPerson } from "@/hooks/use-file-presence"
import { PresenceBadges } from "@/components/builder/code/presence-badges"

// Returns the left padding (px) for a tree row at the given depth.
// Keeps nested folders visually indented.
function indent(depth: number) {
  return { paddingLeft: 8 + depth * 12 }
}

// The project's file tree, rendered one folder at a time from the flat folder map.
// Each folder re-renders on its own when the watcher patches it.
export function FileTree({
  files,
  folder,
  activeFile,
  onSelect,
  viewersOf,
  depth = 0,
}: {
  files: ProjectFiles
  /** Which folder this list is showing. The project root is `""`. */
  folder: string
  activeFile: string
  onSelect: (path: string) => void
  /** Who else has a file open; passed down so there's one presence subscription, not one per folder. */
  viewersOf: (path: string) => PresentPerson[]
  depth?: number
}) {
  const children = files.childrenOf(folder)
  const omitted = files.omittedIn(folder)

  // Not listed yet (an expanded folder always has a request out).
  if (!children) return <Pending depth={depth} />

  if (children.length === 0) {
    return (
      <p
        className="text-ash-dark-surface/60 py-0.5 text-[11px]"
        style={indent(depth)}
      >
        empty
      </p>
    )
  }

  return (
    <ul className="text-[12px]">
      {children.map((entry) =>
        entry.hidden ? (
          <HiddenFolderRow
            key={entry.path}
            entry={entry}
            kind={entry.hidden}
            depth={depth}
          />
        ) : entry.isDirectory ? (
          <FolderRow
            key={entry.path}
            entry={entry}
            files={files}
            activeFile={activeFile}
            onSelect={onSelect}
            viewersOf={viewersOf}
            depth={depth}
          />
        ) : (
          <FileRow
            key={entry.path}
            entry={entry}
            active={entry.path === activeFile}
            viewers={viewersOf(entry.path)}
            onSelect={onSelect}
            depth={depth}
          />
        ),
      )}
      {omitted > 0 && <MoreRow count={omitted} depth={depth} />}
    </ul>
  )
}

const HIDDEN_LABELS: Record<IgnoredFolderKind, string> = {
  dependencies: "installed dependencies",
  build: "build output",
  cache: "cache",
  git: "git data",
}

// A greyed, closed row for an ignored folder (node_modules, .next…): shown so people can see
// it exists, but never opened, because its contents are never listed.
function HiddenFolderRow({
  entry,
  kind,
  depth,
}: {
  entry: PodFile
  kind: IgnoredFolderKind
  depth: number
}) {
  return (
    <li
      className="text-ash-dark-surface/45 flex cursor-default items-center gap-1.5 py-0.5 pr-2 select-none"
      style={indent(depth)}
      title={`${HIDDEN_LABELS[kind]}: not listed here or saved with the project. Use the terminal to look inside.`}
    >
      <span className="h-3 w-3 shrink-0" />
      <Folder className="h-3 w-3 shrink-0" />
      <span className="truncate">{entry.name}</span>
      <span className="ml-auto shrink-0 text-[10px]">hidden</span>
    </li>
  )
}

// The last row of a folder too big to list in full: says how many entries were left out.
function MoreRow({ count, depth }: { count: number; depth: number }) {
  return (
    <li
      className="text-ash-dark-surface/60 flex cursor-default items-center gap-1.5 py-0.5 pr-2 text-[11px] select-none"
      style={indent(depth)}
    >
      <MoreHorizontal className="h-3 w-3 shrink-0" />
      <span className="truncate">
        {count.toLocaleString()} more not shown. Use the terminal to see them.
      </span>
    </li>
  )
}

// A folder row that expands or collapses, rendering its children recursively when open.
// Expanding triggers the first listing of that folder.
function FolderRow({
  entry,
  files,
  activeFile,
  onSelect,
  viewersOf,
  depth,
}: {
  entry: PodFile
  files: ProjectFiles
  activeFile: string
  onSelect: (path: string) => void
  viewersOf: (path: string) => PresentPerson[]
  depth: number
}) {
  const expanded = files.isExpanded(entry.path)
  return (
    <li>
      <button
        onClick={() => files.toggle(entry.path)}
        className="text-ash-dark-surface hover:text-on-dark-surface flex w-full items-center gap-1.5 py-0.5 text-left"
        style={indent(depth)}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        {expanded ? (
          <FolderOpen className="h-3 w-3 shrink-0" />
        ) : (
          <Folder className="h-3 w-3 shrink-0" />
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {expanded && (
        <FileTree
          files={files}
          folder={entry.path}
          activeFile={activeFile}
          onSelect={onSelect}
          viewersOf={viewersOf}
          depth={depth + 1}
        />
      )}
    </li>
  )
}

// A file row that opens the file in the editor, with presence badges for other viewers.
// Highlighted when it's the active file.
function FileRow({
  entry,
  active,
  viewers,
  onSelect,
  depth,
}: {
  entry: PodFile
  active: boolean
  viewers: PresentPerson[]
  onSelect: (path: string) => void
  depth: number
}) {
  return (
    <li>
      <button
        onClick={() => onSelect(entry.path)}
        className={`flex w-full items-center gap-2 py-0.5 pr-2 text-left ${
          active
            ? "bg-surface-dark-elevated text-on-dark-surface"
            : "text-ash-dark-surface hover:text-on-dark-surface"
        }`}
        style={indent(depth)}
      >
        <FileText className="h-3 w-3 shrink-0" />
        <span className="truncate">{entry.name}</span>
        <span className="ml-auto">
          <PresenceBadges people={viewers} max={2} />
        </span>
      </button>
    </li>
  )
}

// "loading…" row shown while a folder is being listed.
// Indented to the folder's depth.
function Pending({ depth }: { depth: number }) {
  return (
    <p
      className="text-ash-dark-surface/60 flex items-center gap-1.5 py-0.5 text-[11px]"
      style={indent(depth)}
    >
      <Loader2 className="h-3 w-3 animate-spin" /> loading…
    </p>
  )
}
