"use client"

import dynamic from "next/dynamic"
import type * as Y from "yjs"

// Monaco touches `window` on import, so the real editor (and its setup code) is client-only.
const EditorInner = dynamic(
  () => import("@/components/builder/code/editor-inner"),
  {
    ssr: false,
    loading: () => <Pending />,
  },
)

// Placeholder shown while the editor bundle loads.
// Matches the "opening…" state used elsewhere in the Code tab.
function Pending() {
  return (
    <div className="text-ash-dark-surface/60 grid h-full place-items-center text-[11px]">
      opening…
    </div>
  )
}

// Client-only Monaco editor bound to a shared Yjs text.
// Thin wrapper so the heavy editor module is never evaluated on the server.
export function Editor({
  path,
  text,
  readOnly,
  onSave,
}: {
  path: string
  text: Y.Text
  readOnly: boolean
  onSave: () => void
}) {
  return (
    <EditorInner path={path} text={text} readOnly={readOnly} onSave={onSave} />
  )
}
