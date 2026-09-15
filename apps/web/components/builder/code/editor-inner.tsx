"use client"

import { useEffect, useRef, useState } from "react"
import MonacoEditor, { loader, type OnMount } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import type * as Y from "yjs"

import { installMonacoWorkers } from "@/components/builder/code/monaco-workers"

// Use the locally installed Monaco (not the CDN copy) so y-monaco and the editor share one
// instance. Workers are installed first; see monaco-workers.ts.
installMonacoWorkers()
loader.config({ monaco })

// Semantic validation is off: the in-browser TS service sees only one file, so every import
// would be flagged. Syntax validation stays on.
for (const defaults of [
  monaco.typescript?.typescriptDefaults,
  monaco.typescript?.javascriptDefaults,
]) {
  // Optional-chained: Monaco has moved these between versions, and throwing here would break the editor.
  defaults?.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  })
}

type CodeEditor = Parameters<OnMount>[0]

const LANGUAGES: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  html: "html",
  md: "markdown",
  py: "python",
  go: "go",
  rs: "rust",
  sh: "shell",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
}

// Maps a file extension to a Monaco language id ("plaintext" when unknown).
// Needed because the editor is given a model, not a filename to guess from.
function languageFor(path: string): string {
  return LANGUAGES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "plaintext"
}

// Monaco editor bound to a shared Yjs text via y-monaco (no value/onChange copy of the text).
// Ctrl+S and blur ask the orchestrator to save; nothing here writes files.
export default function EditorInner({
  path,
  text,
  readOnly,
  onSave,
}: {
  path: string
  text: Y.Text
  readOnly: boolean
  /** Called on Ctrl+S and on blur. */
  onSave: () => void
}) {
  // State (not a ref) so the binding effect re-runs once Monaco mounts.
  const [editor, setEditor] = useState<CodeEditor | null>(null)

  // Ref so the Ctrl+S command is registered once (Monaco commands can't be removed).
  const saveRef = useRef(onSave)

  useEffect(() => {
    saveRef.current = onSave
  })

  useEffect(() => {
    if (!editor) return

    // Ctrl/Cmd+S saves (and stops the browser's own save-page dialog).
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
      saveRef.current(),
    )

    // Save when the editor loses focus.
    const blur = editor.onDidBlurEditorText(() => saveRef.current())
    return () => blur.dispose()
  }, [editor])

  useEffect(() => {
    const model = editor?.getModel()
    if (!editor || !model) return

    let cancelled = false
    let binding: { destroy: () => void } | null = null

    void (async () => {
      const { MonacoBinding } = await import("y-monaco")
      if (cancelled) return
      binding = new MonacoBinding(text, model, new Set([editor]))
    })()

    return () => {
      // Unbind when the file changes so it stops writing into the old document.
      cancelled = true
      binding?.destroy()
    }
  }, [editor, text])

  return (
    <MonacoEditor
      height="100%"
      theme="vs-dark"
      language={languageFor(path)}
      onMount={(instance) => setEditor(instance)}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        renderWhitespace: "selection",
        tabSize: 2,
      }}
    />
  )
}
