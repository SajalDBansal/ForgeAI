"use client"

import { useState, type ReactNode } from "react"
import {
  Paperclip,
  Sparkles,
  ArrowUp,
  Palette,
  FolderGit2,
  FolderPlus,
  ChevronRight,
  Link2,
} from "lucide-react"

import { Button } from "@forgeAI/ui/components/button"
import { Textarea } from "@forgeAI/ui/components/textarea"
import { Input } from "@forgeAI/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@forgeAI/ui/components/select"

import type {
  CreateProjectDataType,
  ProjectMode,
  ProjectSource,
  RepoRef,
} from "@/lib/types"
import { GithubIcon } from "@/components/brand/github-icon"
import {
  useGithubRepos,
  type GithubReposStatus,
} from "@/hooks/use-github-repos"
import { useStartProject } from "@/hooks/use-start-project"
import { displayToast } from "@/lib/toast"
import { CreateEmptyProjectDialog } from "@/components/home/create-empty-project-dialog"
import { GithubVersionsHint } from "@/components/github/github-versions-hint"
import { PUBLIC_ENV } from "@/lib/env"

const AUTH_URL = PUBLIC_ENV.AUTH_URL

const PROMPT_EXAMPLES: string[] = []

type RepoSelection = NonNullable<CreateProjectDataType["repo"]>

// Returns "owner/name" for a repo.
// Used as the select value and in messages.
function repoKey(r: RepoSelection) {
  return `${r.owner}/${r.name}`
}

// Parses a GitHub URL or "owner/repo" into a repo selection (shape only; the API verifies it).
// No branch here: the API falls back to the repo's default branch.
function parseRepoUrl(input: string): RepoSelection | null {
  const trimmed = input
    .trim()
    .replace(/\.git$/i, "")
    .replace(/\/$/, "")
  const urlMatch = trimmed.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)$/i)
  if (urlMatch) return { owner: urlMatch[1]!, name: urlMatch[2]! }
  const shortMatch = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/)
  if (shortMatch) return { owner: shortMatch[1]!, name: shortMatch[2]! }
  return null
}

// The home page prompt box: describe a new project or pick an existing repo, then generate.
// Also offers "Create empty project" from a template.
export function HeroComposer() {
  const [prompt, setPrompt] = useState("")
  const [mode, setMode] = useState<ProjectMode>("BUILD")
  const [source, setSource] = useState<ProjectSource>("MANUAL")
  const [selectedRepo, setSelectedRepo] = useState<RepoSelection | null>(null)
  const [repoUrlInput, setRepoUrlInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [emptyProjectOpen, setEmptyProjectOpen] = useState(false)
  const { repos: githubRepos, status: githubStatus } = useGithubRepos(
    source === "GITHUB",
  )
  const startProject = useStartProject()

  const githubConnected = githubStatus === "connected"
  const repo = source === "GITHUB" ? selectedRepo : null
  const canSubmit =
    !submitting &&
    prompt.trim().length > 0 &&
    (source === "MANUAL" || (githubConnected && !!repo))

  // Creates the project from the prompt (and repo, for existing-repo sessions).
  const submit = async (text?: string) => {
    const value = text ?? prompt
    if (!value.trim() || submitting) return
    if (source === "GITHUB" && (!githubConnected || !repo)) return

    setSubmitting(true)
    const created = await startProject({ prompt: value, mode, source, repo })
    setSubmitting(false)
    if (created) setPrompt("")
  }

  // Attaches the repo typed into the URL field, or explains the expected format.
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
      <div className="border-hairline bg-canvas mt-10 rounded-sm border">
        <div className="flex items-center gap-1 px-2 pt-2 pb-3">
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
          <button
            type="button"
            onClick={() => setEmptyProjectOpen(true)}
            className="text-mute hover:text-ink ml-auto inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Create empty project
          </button>
        </div>

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit()
          }}
          rows={7}
          placeholder={
            source === "MANUAL"
              ? "e.g. Build a SaaS analytics dashboard with KPIs, charts, and a sidebar."
              : "e.g. Fix the checkout bug and add a promo-code field to the cart."
          }
          className="placeholder:text-stone min-h-40 w-full resize-none border-0 bg-transparent px-4 py-3 text-[15px] shadow-none focus-visible:ring-0"
        />

        {source === "GITHUB" && (
          <RepoPicker
            status={githubStatus}
            repos={githubRepos}
            repo={repo}
            onSelect={setSelectedRepo}
            urlInput={repoUrlInput}
            onUrlInputChange={setRepoUrlInput}
            onAttachUrl={attachFromUrl}
          />
        )}

        <div className="hairline-t flex flex-wrap items-center gap-1 px-2 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => displayToast("Attach (mock)")}
            className="text-mute hover:text-ink h-8 gap-1.5 px-2.5 text-xs"
          >
            <Paperclip className="h-4 w-4" /> Attach
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => displayToast("Design system (mock)")}
            className="text-mute hover:text-ink h-8 gap-1.5 px-2.5 text-xs"
          >
            <Palette className="h-4 w-4" /> Design
          </Button>

          <ModeToggle mode={mode} onChange={setMode} />

          <div className="ml-auto flex items-center gap-2">
            <span className="text-mute hidden text-[11px] sm:inline">
              ⌘ + ↵ to send
            </span>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="bg-ink text-on-primary disabled:bg-surface-card disabled:text-ash h-8 gap-1.5 rounded-sm text-sm"
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
        <GithubVersionsHint />
      ) : (
        <div className="text-mute mt-3 flex items-center gap-1.5 text-[11px]">
          <ChevronRight className="h-3 w-3" />
          Code changes land as a pull request on the attached repo — nothing is
          pushed to the default branch directly.
        </div>
      )}

      {source === "MANUAL" && PROMPT_EXAMPLES.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {PROMPT_EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setPrompt(ex)}
              className="bg-surface-soft text-body border-hairline hover:bg-surface-card rounded-sm border px-3 py-1.5 text-xs"
            >
              <span className="text-mute mr-1.5">[+]</span>
              {ex}
            </button>
          ))}
        </div>
      )}

      {emptyProjectOpen && (
        <CreateEmptyProjectDialog onClose={() => setEmptyProjectOpen(false)} />
      )}
    </>
  )
}

// Repo chooser for existing-repo sessions: connect GitHub, pick a repo, or paste a URL.
// Stateless; the composer owns the selection and the URL field.
function RepoPicker({
  status,
  repos,
  repo,
  onSelect,
  urlInput,
  onUrlInputChange,
  onAttachUrl,
}: {
  status: GithubReposStatus
  repos: RepoRef[]
  repo: RepoSelection | null
  onSelect: (repo: RepoSelection | null) => void
  urlInput: string
  onUrlInputChange: (value: string) => void
  onAttachUrl: () => void
}) {
  if (status === "loading") {
    return (
      <div className="px-4 pt-3 pb-3">
        <p className="text-mute inline-flex h-8 items-center gap-1.5 text-xs">
          <GithubIcon className="h-3.5 w-3.5" /> Checking your GitHub
          connection…
        </p>
      </div>
    )
  }

  if (status !== "connected") {
    return (
      <div className="px-4 pt-3 pb-3">
        <a
          href={`${AUTH_URL}/api/v1/connections/github/start`}
          className="border-hairline text-body hover:bg-surface-soft inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-xs"
        >
          <GithubIcon className="h-3.5 w-3.5" /> Connect GitHub to attach a repo
        </a>
      </div>
    )
  }

  return (
    <div className="px-4 pt-3 pb-3">
      <div className="space-y-2">
        <Select
          value={repo ? repoKey(repo) : undefined}
          onValueChange={(key) =>
            onSelect(repos.find((r) => repoKey(r) === key) ?? null)
          }
        >
          <SelectTrigger className="border-hairline bg-canvas h-8 w-full rounded-sm text-xs sm:w-72">
            <GithubIcon className="mr-1 h-3.5 w-3.5 shrink-0" />
            <SelectValue
              placeholder={
                repos.length
                  ? "Select a repository…"
                  : "No repositories shared with ForgeAI"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {repos.map((r) => (
              <SelectItem key={repoKey(r)} value={repoKey(r)}>
                {repoKey(r)}
                <span className="text-mute ml-1.5">· {r.branch}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <span className="text-mute shrink-0 text-[11px]">or paste a URL</span>
          <Input
            value={urlInput}
            onChange={(e) => onUrlInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                onAttachUrl()
              }
            }}
            placeholder="github.com/owner/repo"
            className="border-hairline bg-canvas h-8 flex-1 rounded-sm text-xs sm:w-72"
          />
          <button
            type="button"
            onClick={onAttachUrl}
            disabled={!urlInput.trim()}
            className="border-hairline hover:bg-surface-soft inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border px-2.5 text-xs disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <Link2 className="h-3.5 w-3.5" /> Attach
          </button>
        </div>

        {repo && (
          <p className="text-mute text-[11px]">
            Attached: {repoKey(repo)} · {repo.branch ?? "default branch"}
          </p>
        )}
      </div>
    </div>
  )
}

// Plan / Build switch for the new project's starting mode.
// Build is the default.
function ModeToggle({
  mode,
  onChange,
}: {
  mode: ProjectMode
  onChange: (mode: ProjectMode) => void
}) {
  return (
    <div className="border-hairline ml-1 flex overflow-hidden rounded-sm border">
      <button
        onClick={() => onChange("PLAN")}
        className={`px-2.5 py-1 text-xs ${mode === "PLAN" ? "bg-ink text-on-primary" : "text-mute"}`}
      >
        Plan
      </button>
      <button
        onClick={() => onChange("BUILD")}
        className={`px-2.5 py-1 text-xs ${mode === "BUILD" ? "bg-ink text-on-primary" : "text-mute"}`}
      >
        Build
      </button>
    </div>
  )
}

// One tab in the composer's source switcher ("New project" / "Existing repo").
// Highlighted when active.
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
      className={`inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs ${
        active
          ? "bg-surface-soft text-ink font-medium"
          : "text-mute hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
