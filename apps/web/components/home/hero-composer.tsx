"use client"

import { useState, type ReactNode } from "react"
import { Paperclip, Sparkles, ArrowUp, Palette, FolderGit2, ChevronRight, Link2 } from "lucide-react"

import { Button } from "@forgeAI/ui/components/button"
import { Textarea } from "@forgeAI/ui/components/textarea"
import { Input } from "@forgeAI/ui/components/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@forgeAI/ui/components/select"

import type { ProjectMode, ProjectSource, RepoRef } from "@/lib/types"
import { GithubIcon } from "@/components/brand/github-icon"
import { displayToast } from "@/lib/toast"

const PROMPT_EXAMPLES: string[] = []

const GITHUB_REPOS: RepoRef[] = []

function repoKey(r: RepoRef) {
  return `${r.owner}/${r.name}`
}

function parseRepoUrl(input: string): RepoRef | null {
  const trimmed = input.trim().replace(/\.git$/i, "").replace(/\/$/, "")
  const urlMatch = trimmed.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)$/i)
  if (urlMatch) return { owner: urlMatch[1]!, name: urlMatch[2]!, branch: "main" }
  const shortMatch = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/)
  if (shortMatch) return { owner: shortMatch[1]!, name: shortMatch[2]!, branch: "main" }
  return null
}

export function HeroComposer() {
  const [prompt, setPrompt] = useState("")
  const [mode, setMode] = useState<ProjectMode>("BUILD")
  const [source, setSource] = useState<ProjectSource>("MANUAL")
  const [githubConnected, setGithubConnected] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<RepoRef | null>(null)
  const [repoUrlInput, setRepoUrlInput] = useState("")

  const repo = source === "GITHUB" ? selectedRepo : null
  const canSubmit = prompt.trim().length > 0 && (source === "MANUAL" || (githubConnected && !!repo))

  const submit = (text?: string) => {
    const value = text ?? prompt
    if (!value.trim()) return
    if (source === "GITHUB" && (!githubConnected || !repo)) return
  }

  const attachFromUrl = () => {
    const parsed = parseRepoUrl(repoUrlInput)
    if (!parsed) {
      displayToast("Enter a valid GitHub repo URL, e.g. github.com/owner/repo")
      return
    }
    setSelectedRepo(parsed)
    setRepoUrlInput("")
    displayToast(`Attached ${repoKey(parsed)}`)
  }

  return (
    <>
      <div className="mt-10 border border-hairline rounded-sm bg-canvas">
        <div className="px-2 pt-2 pb-3 flex items-center gap-1">
          <SourceTab
            active={source === "MANUAL"}
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="New project"
            onClick={() => setSource("MANUAL")}
          />
          <SourceTab
            active={source === "GITHUB"}
            icon={<FolderGit2 className="h-3.5 w-3.5" />}
            label="Existing repo"
            onClick={() => setSource("GITHUB")}
          />
        </div>

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit()
          }}
          rows={7}
          placeholder={
            source === "MANUAL"
              ? "e.g. Build a SaaS analytics dashboard with KPIs, charts, and a sidebar."
              : "e.g. Fix the checkout bug and add a promo-code field to the cart."
          }
          className="w-full min-h-40 resize-none border-0 bg-transparent px-4 py-3 text-[15px] shadow-none focus-visible:ring-0 placeholder:text-stone"
        />

        {source === "GITHUB" && (
          <div className="px-4 pt-3 pb-3">
            {!githubConnected ? (
              <button
                type="button"
                onClick={() => {
                  setGithubConnected(true)
                  displayToast("Connect GitHub to attach a repository")
                }}
                className="h-8 px-2.5 text-xs border border-hairline rounded-sm text-body hover:bg-surface-soft inline-flex items-center gap-1.5"
              >
                <GithubIcon className="h-3.5 w-3.5" /> Connect GitHub to attach a repo
              </button>
            ) : (
              <div className="space-y-2">
                <Select
                  value={repo ? repoKey(repo) : undefined}
                  onValueChange={(key) => setSelectedRepo(GITHUB_REPOS.find((r) => repoKey(r) === key) ?? null)}
                >
                  <SelectTrigger className="w-full sm:w-72 h-8 rounded-sm border-hairline bg-canvas text-xs">
                    <GithubIcon className="h-3.5 w-3.5 mr-1 shrink-0" />
                    <SelectValue placeholder="Select a repository…" />
                  </SelectTrigger>
                  <SelectContent>
                    {GITHUB_REPOS.map((r) => (
                      <SelectItem key={repoKey(r)} value={repoKey(r)}>
                        {repoKey(r)}
                        <span className="text-mute ml-1.5">· {r.branch}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-mute shrink-0">or paste a URL</span>
                  <Input
                    value={repoUrlInput}
                    onChange={(e) => setRepoUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        attachFromUrl()
                      }
                    }}
                    placeholder="github.com/owner/repo"
                    className="h-8 flex-1 sm:w-72 rounded-sm border-hairline bg-canvas text-xs"
                  />
                  <button
                    type="button"
                    onClick={attachFromUrl}
                    disabled={!repoUrlInput.trim()}
                    className="h-8 px-2.5 text-xs border border-hairline rounded-sm hover:bg-surface-soft disabled:opacity-50 disabled:hover:bg-transparent inline-flex items-center gap-1.5 shrink-0"
                  >
                    <Link2 className="h-3.5 w-3.5" /> Attach
                  </button>
                </div>

                {repo && <p className="text-[11px] text-mute">Attached: {repoKey(repo)} · {repo.branch}</p>}
              </div>
            )}
          </div>
        )}

        <div className="hairline-t px-2 py-2 flex items-center gap-1 flex-wrap">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => displayToast("Attach (mock)")}
            className="h-8 px-2.5 text-xs text-mute hover:text-ink gap-1.5"
          >
            <Paperclip className="h-4 w-4" /> Attach
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => displayToast("Design system (mock)")}
            className="h-8 px-2.5 text-xs text-mute hover:text-ink gap-1.5"
          >
            <Palette className="h-4 w-4" /> Design
          </Button>

          <div className="ml-1 flex border border-hairline rounded-sm overflow-hidden">
            <button
              onClick={() => setMode("PLAN")}
              className={`px-2.5 py-1 text-xs ${mode === "PLAN" ? "bg-ink text-on-primary" : "text-mute"}`}
            >
              Plan
            </button>
            <button
              onClick={() => setMode("BUILD")}
              className={`px-2.5 py-1 text-xs ${mode === "BUILD" ? "bg-ink text-on-primary" : "text-mute"}`}
            >
              Build
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-mute hidden sm:inline">⌘ + ↵ to send</span>
            <Button
              type="button"
              onClick={() => submit()}
              disabled={!canSubmit}
              className="h-8 rounded-sm bg-ink text-on-primary text-sm gap-1.5 disabled:bg-surface-card disabled:text-ash"
            >
              {source === "MANUAL" ? (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate
                </>
              ) : (
                <>
                  <FolderGit2 className="h-3.5 w-3.5" />
                  Start session
                </>
              )}
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {source === "MANUAL" ? (
        <div className="mt-3 text-[11px] text-mute flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3" />
          ForgeAI creates a new GitHub repo under your account and pushes every commit there.
        </div>
      ) : (
        <div className="mt-3 text-[11px] text-mute flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3" />
          Code changes land as a pull request on the attached repo — nothing is pushed to the default branch directly.
        </div>
      )}

      {source === "MANUAL" && PROMPT_EXAMPLES.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {PROMPT_EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setPrompt(ex)}
              className="text-xs px-3 py-1.5 bg-surface-soft text-body border border-hairline rounded-sm hover:bg-surface-card"
            >
              <span className="text-mute mr-1.5">[+]</span>
              {ex}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function SourceTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 px-2.5 rounded-sm text-xs inline-flex items-center gap-1.5 ${active ? "bg-surface-soft text-ink font-medium" : "text-mute hover:text-ink"
        }`}
    >
      {icon}
      {label}
    </button>
  )
}
