"use client"

import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { displayToast } from "@/lib/toast"
import { Row, inputCls } from "@/components/settings/row"

// Settings tab for display name, email, handle and avatar.
// Demo form; saving only shows a toast.
export function ProfileTab() {
  return (
    <PageCard className="p-5">
      <SectionHeader label="Profile" />
      <Row label="Display name">
        <input className={inputCls} defaultValue="Ada Lovelace" />
      </Row>
      <Row label="Email">
        <input
          className={inputCls}
          type="email"
          defaultValue="ada@forgeai.dev"
        />
      </Row>
      <Row label="Handle" hint="Used in shared URLs">
        <input className={inputCls} defaultValue="ada" />
      </Row>
      <Row label="Avatar">
        <div className="flex items-center gap-3">
          <div className="bg-ink text-on-primary flex h-12 w-12 items-center justify-center rounded-sm font-bold">
            A
          </div>
          <button
            onClick={() => displayToast("Upload disabled (demo)")}
            className="border-hairline hover:bg-surface-soft h-9 rounded-sm border px-3 text-sm"
          >
            Upload
          </button>
        </div>
      </Row>
      <div className="flex justify-end gap-2 pt-4">
        <button className="border-hairline hover:bg-surface-soft h-9 rounded-sm border px-4 text-sm">
          Reset
        </button>
        <button
          onClick={() => displayToast("Saved (demo)")}
          className="bg-ink text-on-primary hover:bg-ink-deep h-9 rounded-sm px-4 text-sm font-medium"
        >
          Save
        </button>
      </div>
    </PageCard>
  )
}
