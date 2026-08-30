"use client"

import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { displayToast } from "@/lib/toast"
import { Row, inputCls } from "@/components/settings/row"

export function ProfileTab() {
  return (
    <PageCard className="p-5">
      <SectionHeader label="Profile" />
      <Row label="Display name">
        <input className={inputCls} defaultValue="Ada Lovelace" />
      </Row>
      <Row label="Email">
        <input className={inputCls} type="email" defaultValue="ada@forgeai.dev" />
      </Row>
      <Row label="Handle" hint="Used in shared URLs">
        <input className={inputCls} defaultValue="ada" />
      </Row>
      <Row label="Avatar">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-sm bg-ink text-on-primary flex items-center justify-center font-bold">
            A
          </div>
          <button
            onClick={() => displayToast("Upload disabled (demo)")}
            className="text-sm h-9 px-3 border border-hairline rounded-sm hover:bg-surface-soft"
          >
            Upload
          </button>
        </div>
      </Row>
      <div className="pt-4 flex justify-end gap-2">
        <button className="h-9 px-4 border border-hairline rounded-sm text-sm hover:bg-surface-soft">
          Reset
        </button>
        <button
          onClick={() => displayToast("Saved (demo)")}
          className="h-9 px-4 bg-ink text-on-primary rounded-sm text-sm font-medium hover:bg-ink-deep"
        >
          Save
        </button>
      </div>
    </PageCard>
  )
}
