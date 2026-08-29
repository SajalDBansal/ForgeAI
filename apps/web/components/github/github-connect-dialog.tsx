"use client"

import { useState } from "react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@forgeAI/ui/components/select"
import { Switch } from "@forgeAI/ui/components/switch"

import { ModalShell, btnGhost, btnPrimary } from "@/components/modal/modal-shell"
import { GithubIcon } from "@/components/brand/github-icon"
import { displayToast } from "@/lib/toast"

export function GithubConnectDialog({
  projectName = "fintech-landing",
  onClose,
}: {
  projectName?: string
  onClose?: () => void
}) {
  const [connected, setConnected] = useState(false)
  const [org, setOrg] = useState("forgeai-studio")
  const [autoSync, setAutoSync] = useState(true)

  return (
    <ModalShell
      title="Connect GitHub"
      subtitle={`Sync ${projectName} to a GitHub repository. Push happens after every successful build.`}
      onClose={onClose}
      footer={
        <>
          <button onClick={() => (onClose ? onClose() : displayToast("Closed"))} className={btnGhost}>
            Done
          </button>
          {!connected && (
            <button
              onClick={() => {
                setConnected(true)
                displayToast("Connected to GitHub (demo)")
              }}
              className={btnPrimary}
            >
              <GithubIcon className="h-4 w-4" /> Connect GitHub
            </button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-sm bg-ink text-on-primary flex items-center justify-center shrink-0">
            <GithubIcon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">GitHub</span>
              <span
                className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm ${connected ? "bg-success/15 text-success" : "bg-surface-card text-mute"
                  }`}
              >
                {connected ? "Connected" : "Not connected"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-body">
              {connected ? `Pushing to ${org}/forge-${projectName}` : "Not linked to a repository yet"}
            </p>
          </div>
          {connected && (
            <button
              onClick={() => {
                setConnected(false)
                displayToast("Disconnected GitHub (demo)")
              }}
              className="text-xs text-mute hover:text-danger shrink-0"
            >
              Disconnect
            </button>
          )}
        </div>

        {connected && (
          <>
            <div>
              <div className="text-[11px] uppercase tracking-widest text-mute mb-1.5">Organization</div>
              <Select value={org} onValueChange={setOrg}>
                <SelectTrigger className="w-full h-9 rounded-sm border-hairline bg-canvas text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="forgeai-studio">forgeai-studio</SelectItem>
                  <SelectItem value="ada-personal">ada-personal</SelectItem>
                  <SelectItem value="acme-corp">acme-corp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={autoSync} onCheckedChange={setAutoSync} />
              Auto-push after every successful build
            </label>
          </>
        )}
      </div>
    </ModalShell>
  )
}
