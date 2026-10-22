import { prisma, type Prisma, type RepoRef } from "@forgeAI/database"
import { PermanentJobError } from "@forgeAI/jobs"
import {
  INITIAL_COMMIT_MESSAGE,
  ORCHESTRATOR_REQUEST_TIMEOUT_MS,
  type GitCheckResult,
  type GitCommitInfo,
  type GitCommitResult,
  type GitRefusal,
  type GitRemote,
  type GitResolveResult,
  type GitShiftDetails,
  type ProjectCommit,
  type ShiftChoice,
  type ShiftPick,
} from "@forgeAI/shared"
import type { FastifyInstance } from "fastify"

import {
  forgeBotIdentity,
  githubApi,
  mintRepoToken,
} from "../lib/connections/github.js"
import { ENV_CONFIG } from "../lib/envConfig.js"
import { withProjectLock } from "../lib/locks.js"
import { publishProjectEvent } from "../lib/project-events.js"
import {
  liveProjectFilter,
  projectAccessFilter,
  toProjectCommit,
} from "./build.service.js"
import {
  createProjectRepo,
  ownerGitAuthor,
  ownerGithub,
  type OwnerGithub,
} from "./github-repo.service.js"
import {
  callOrchestrator,
  podPath,
  type SandboxFailure,
} from "./sandbox.service.js"

// GitHub as each project's version control. Commits are real git commits made in the
// sandbox and pushed to the owner's repo; this service checks permissions, mints the
// per-repo token, and keeps `lastKnownSha` and the ProjectCommit history cache in step.

/** Longer than the orchestrator's longest request, so a slow commit is never overlapped. */
const COMMIT_LOCK_TTL_MS = ORCHESTRATOR_REQUEST_TIMEOUT_MS + 60_000

/** Commit message used when the owner keeps their version over GitHub's changes. */
const KEPT_MESSAGE = "Kept ForgeAI's version over GitHub's changes"

const HEAD_CHECK_TTL_MS = ENV_CONFIG.GITHUB_HEAD_CHECK_TTL_MS

export type GitVcResult =
  | { ok: true; data: ProjectCommit }
  /** Not the owner, or the project is archived. */
  | { ok: false; reason: "not_found" }
  /** The project isn't on GitHub, or its owner has disconnected GitHub. */
  | { ok: false; reason: "no_github" }
  /** Another commit or rollback of this project is running. */
  | { ok: false; reason: "busy" }
  | { ok: false; reason: "no_commit" }
  /** The repository was imported; ForgeAI doesn't write to it. */
  | { ok: false; reason: "imported" }
  /** Already on GitHub: nothing to connect. */
  | { ok: false; reason: "already" }
  /** Git answered no (nothing changed, GitHub moved, …). */
  | { ok: false; reason: "refused"; refusal: GitRefusal }
  /** GitHub itself refused or failed before git ran. */
  | { ok: false; reason: "github"; message: string }
  | { ok: false; reason: SandboxFailure; message?: string }

type RepoOnGithub = RepoRef & { lastKnownSha: string }

interface ProjectGit {
  projectId: string
  repo: RepoOnGithub
  github: OwnerGithub
}

type GitAnswer<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "refused"; refusal: GitRefusal }
  | { ok: false; reason: SandboxFailure; message?: string }

// Checks whether a repo is a ForgeAI-managed repo that already has a first commit.
// Only such repos can be committed to or checked for shifts.
function onGithub(repo: RepoRef | null): repo is RepoOnGithub {
  return Boolean(repo?.managed && repo.lastKnownSha)
}

// Turns a GitHub/token error into a message for the person.
// Shared by every path that talks to GitHub before git runs.
function githubErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "GitHub couldn't be reached"
}

// Checks whether the user owns this project's workspace and neither is archived.
// Owner-only git actions (commit, rollback, keep mine, connect) use this.
async function ownsLiveProject(
  userId: string,
  projectId: string,
): Promise<boolean> {
  const count = await prisma.project.count({
    where: {
      id: projectId,
      archivedAt: null,
      workspace: { userId, archivedAt: null },
    },
  })
  return count > 0
}

// Loads the project's repo and owner GitHub connection, if `userId` owns it.
// The owner alone commits and rolls back.
async function ownedProjectGit(
  userId: string,
  projectId: string,
): Promise<ProjectGit | "not_found" | "no_github"> {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      archivedAt: null,
      workspace: { userId, archivedAt: null },
    },
    select: { repo: true, workspace: { select: { userId: true } } },
  })
  if (!project) return "not_found"
  if (!onGithub(project.repo)) return "no_github"
  const github = await ownerGithub(project.workspace.userId)
  return github ? { projectId, repo: project.repo, github } : "no_github"
}

// Reads the current head commit of a repo's branch through the GitHub API.
// Used to find a new repo's starting commit and to check for shifts.
async function branchHeadSha(
  token: string,
  repo: { owner: string; name: string; branch: string },
): Promise<string> {
  const ref = await githubApi<{ object: { sha: string } }>(
    token,
    "GET",
    `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/ref/heads/${encodeURIComponent(repo.branch)}`,
  )
  return ref.object.sha
}

// Builds what the sandbox needs to reach the repo: URL, a one-hour repo token, branch and base.
// Looks up and stores the repo's GitHub id once, so tokens survive a rename.
async function remoteFor({ repo, github }: ProjectGit): Promise<GitRemote> {
  if (!repo.githubRepoId) {
    const token = await mintRepoToken(github.installationId, repo)
    const found = await githubApi<{ id: number }>(
      token,
      "GET",
      `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`,
    )
    repo.githubRepoId = String(found.id)
    await prisma.repoRef.update({
      where: { id: repo.id },
      data: { githubRepoId: repo.githubRepoId },
    })
  }
  return {
    cloneUrl: `https://github.com/${repo.owner}/${repo.name}.git`,
    token: await mintRepoToken(github.installationId, repo),
    branch: repo.branch,
    lastKnownSha: repo.lastKnownSha,
  }
}

// Sends one git request to the orchestrator and unwraps its answer.
// Git refusals arrive as 200 with `ok: false` and become `refused` here.
async function orchestratorGit<T>(
  app: FastifyInstance,
  projectId: string,
  path: string,
  body: unknown,
): Promise<GitAnswer<T>> {
  const response = await callOrchestrator<
    ({ ok: true } & T) | { ok: false; refusal: GitRefusal }
  >(app, "POST", podPath(projectId, path), body)
  if (!response.ok) return response
  if (!response.data.ok)
    return { ok: false, reason: "refused", refusal: response.data.refusal }
  return { ok: true, data: response.data as unknown as T }
}

// Records where GitHub's branch was seen and announces a shift the first time it moves.
// Seeing the same head again announces nothing.
async function noteGithubHead(
  projectId: string,
  repo: RepoRef,
  githubHead: string,
): Promise<void> {
  await prisma.repoRef.update({
    where: { id: repo.id },
    data: { githubHeadSha: githubHead, checkedAt: new Date() },
  })
  const moved =
    githubHead !== repo.lastKnownSha && githubHead !== repo.githubHeadSha
  repo.githubHeadSha = githubHead
  repo.checkedAt = new Date()
  if (moved)
    publishProjectEvent({ type: "github.shift", projectId, githubHead })
}

// Remembers where GitHub went when git refused because of a shift.
// A no-op for any other refusal.
async function noteShift(
  projectId: string,
  repo: RepoRef,
  refusal: GitRefusal,
): Promise<void> {
  if (refusal.reason === "shift" && refusal.shift.githubHead)
    await noteGithubHead(projectId, repo, refusal.shift.githubHead)
}

// Stores the new commit as HEAD, moves `lastKnownSha` to it and tells every tab.
// Called after a successful commit or rollback push.
async function recordGitCommit(
  projectId: string,
  userId: string,
  repoId: string,
  message: string,
  login: string,
  result: GitCommitResult,
): Promise<ProjectCommit> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  })
  const [, row] = await prisma.$transaction([
    prisma.projectCommit.updateMany({
      where: { projectId, isHead: true },
      data: { isHead: false },
    }),
    prisma.projectCommit.create({
      data: {
        projectId,
        hash: result.sha,
        source: "FORGEAI",
        author: user?.name || login,
        authorLogin: login,
        prompt: message,
        filesChanged: result.files.length,
        additions: result.additions,
        deletions: result.deletions,
        files: result.files as unknown as Prisma.InputJsonValue,
        isHead: true,
      },
    }),
    prisma.repoRef.update({
      where: { id: repoId },
      data: {
        lastKnownSha: result.sha,
        githubHeadSha: result.sha,
        checkedAt: new Date(),
      },
    }),
  ])
  const commit = toProjectCommit(row)
  publishProjectEvent({ type: "commit.created", projectId, commit })
  return commit
}

// Commits and pushes under the project's commit lock, so only one runs at a time.
// Returns `busy` when another commit or rollback holds the lock.
async function commitThroughGit(
  app: FastifyInstance,
  userId: string,
  git: ProjectGit,
  path: "/git/commit" | "/git/rollback",
  message: string,
  extra: Record<string, string> = {},
): Promise<GitVcResult> {
  const locked = await withProjectLock(
    "commit",
    git.projectId,
    COMMIT_LOCK_TTL_MS,
    () => commitLocked(app, userId, git, path, message, extra),
  )
  return locked.ok ? locked.value : { ok: false, reason: "busy" }
}

// Makes the commit in the sandbox (owner as author, ForgeAI as co-author) and records it.
// For callers already holding the commit lock.
async function commitLocked(
  app: FastifyInstance,
  userId: string,
  git: ProjectGit,
  path: "/git/commit" | "/git/rollback",
  message: string,
  extra: Record<string, string> = {},
): Promise<GitVcResult> {
  let remote: GitRemote
  let coAuthor: { name: string; email: string }
  try {
    ;[remote, coAuthor] = await Promise.all([
      remoteFor(git),
      forgeBotIdentity(),
    ])
  } catch (error) {
    console.error(
      `[git] ${git.projectId}: couldn't reach GitHub for a token:`,
      error,
    )
    return { ok: false, reason: "github", message: githubErrorMessage(error) }
  }

  const { login, ...author } = ownerGitAuthor(git.github)
  const answer = await orchestratorGit<GitCommitResult>(
    app,
    git.projectId,
    path,
    {
      remote,
      author,
      message: `${message}\n\nCo-authored-by: ${coAuthor.name} <${coAuthor.email}>`,
      ...extra,
    },
  )
  if (!answer.ok) {
    if (answer.reason === "refused")
      await noteShift(git.projectId, git.repo, answer.refusal)
    return answer
  }
  return {
    ok: true,
    data: await recordGitCommit(
      git.projectId,
      userId,
      git.repo.id,
      message,
      login,
      answer.data,
    ),
  }
}

// Commits everything in the project to GitHub.
// Owner only.
export async function commitProject(
  app: FastifyInstance,
  userId: string,
  projectId: string,
  message: string,
): Promise<GitVcResult> {
  const git = await ownedProjectGit(userId, projectId)
  if (typeof git === "string") return { ok: false, reason: git }
  return commitThroughGit(app, userId, git, "/git/commit", message)
}

// Rolls back to a pre-GitHub (tar archive) version and commits the result.
// Checks GitHub hasn't moved first, so files never change and then fail to commit.
async function rollbackLegacy(
  app: FastifyInstance,
  userId: string,
  git: ProjectGit,
  commitId: string,
  prompt: string,
): Promise<GitVcResult> {
  const { projectId } = git
  const locked = await withProjectLock(
    "commit",
    projectId,
    COMMIT_LOCK_TTL_MS,
    async (): Promise<GitVcResult> => {
      let remote: GitRemote
      try {
        remote = await remoteFor(git)
      } catch (error) {
        return {
          ok: false,
          reason: "github",
          message: githubErrorMessage(error),
        }
      }
      const ready = await orchestratorGit<{ githubHead: string }>(
        app,
        projectId,
        "/git/prepare",
        { remote },
      )
      if (!ready.ok) {
        if (ready.reason === "refused")
          await noteShift(projectId, git.repo, ready.refusal)
        return ready
      }
      const restored = await callOrchestrator<void>(
        app,
        "POST",
        podPath(projectId, "/restore-commit"),
        { commitId },
      )
      if (!restored.ok) return restored
      return commitLocked(
        app,
        userId,
        git,
        "/git/commit",
        `Rolled back to "${prompt}" (from before GitHub)`,
      )
    },
  )
  return locked.ok ? locked.value : { ok: false, reason: "busy" }
}

// Restores the project to a past commit and commits that as a new entry.
// Owner only; legacy (pre-GitHub) versions go through rollbackLegacy.
export async function rollbackProject(
  app: FastifyInstance,
  userId: string,
  projectId: string,
  commitId: string,
): Promise<GitVcResult> {
  const git = await ownedProjectGit(userId, projectId)
  if (typeof git === "string") return { ok: false, reason: git }

  const target = await prisma.projectCommit.findFirst({
    where: { id: commitId, projectId },
    select: { hash: true, prompt: true, source: true },
  })
  if (!target) return { ok: false, reason: "no_commit" }

  if (target.source !== "LEGACY" && /^[0-9a-f]{40}$/.test(target.hash)) {
    const message = `Rolled back to "${target.prompt}" (${target.hash.slice(0, 7)})`
    return commitThroughGit(app, userId, git, "/git/rollback", message, {
      sha: target.hash,
    })
  }

  return rollbackLegacy(app, userId, git, commitId, target.prompt)
}

// Creates the repo if needed and reads the commit it starts from (GitHub's README commit).
// Gives putOnGithub a repo it can make the first commit on top of.
async function prepareFirstCommitRepo(
  project: {
    id: string
    name: string
    description: string | null
    repo: RepoRef | null
  },
  github: OwnerGithub,
): Promise<RepoOnGithub> {
  const created = project.repo ?? (await createProjectRepo(project, github))
  const token = await mintRepoToken(github.installationId, created)
  return { ...created, lastKnownSha: await branchHeadSha(token, created) }
}

// Makes the project's first GitHub commit from its sandbox, creating the repo when allowed.
// Idempotent under the commit lock; without a sandbox the commit waits for prepareProjectGit.
async function putOnGithub(
  app: FastifyInstance,
  projectId: string,
  allowCreate: boolean,
): Promise<GitVcResult> {
  const locked = await withProjectLock(
    "commit",
    projectId,
    COMMIT_LOCK_TTL_MS,
    async (): Promise<GitVcResult> => {
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          archivedAt: null,
          workspace: { archivedAt: null },
        },
        select: {
          id: true,
          name: true,
          description: true,
          repo: true,
          workspace: { select: { userId: true } },
          _count: { select: { commits: true } },
        },
      })
      if (!project) return { ok: false, reason: "not_found" }
      if (project.repo && !project.repo.managed)
        return { ok: false, reason: "imported" }
      if (onGithub(project.repo)) return { ok: false, reason: "already" }
      if (!project.repo && !allowCreate)
        return { ok: false, reason: "no_github" }

      const ownerId = project.workspace.userId
      const github = await ownerGithub(ownerId)
      if (!github) return { ok: false, reason: "no_github" }

      let repo: RepoOnGithub
      try {
        repo = await prepareFirstCommitRepo(project, github)
      } catch (error) {
        if (error instanceof PermanentJobError) throw error
        return {
          ok: false,
          reason: "github",
          message: githubErrorMessage(error),
        }
      }

      // New projects get "Initial Commit"; ones with pre-GitHub history were "connected".
      const message =
        project._count.commits === 0
          ? INITIAL_COMMIT_MESSAGE
          : "Connected to GitHub"
      const result = await commitLocked(
        app,
        ownerId,
        { projectId, repo, github },
        "/git/commit",
        message,
      )
      if (result.ok) {
        const linked = await prisma.repoRef.findUniqueOrThrow({
          where: { id: repo.id },
        })
        publishProjectEvent({
          type: "commit.updated",
          projectId,
          commit: result.data,
          repo: linked,
        })
      }
      return result
    },
  )
  return locked.ok ? locked.value : { ok: false, reason: "busy" }
}

// "Put on GitHub": creates the repo (or reuses an unfinished one) and commits current files.
// Owner only; the project must be open since git runs in its sandbox.
export async function connectProjectToGithub(
  app: FastifyInstance,
  userId: string,
  projectId: string,
): Promise<GitVcResult> {
  if (!(await ownsLiveProject(userId, projectId)))
    return { ok: false, reason: "not_found" }
  if (!(await ownerGithub(userId))) return { ok: false, reason: "no_github" }
  return putOnGithub(app, projectId, true)
}

// Creates a new project's repo in the background when the owner has GitHub connected.
// The queue owns retries; do not swallow retryable failures here.
export async function startProjectOnGithub(
  app: FastifyInstance,
  projectId: string,
): Promise<void> {
  requireBackgroundGitResult(await putOnGithub(app, projectId, true))
}

function requireBackgroundGitResult(result: GitVcResult): void {
  if (
    result.ok ||
    ["no_github", "no_pod", "not_found", "already", "imported"].includes(
      result.reason,
    )
  )
    return
  if (result.reason === "refused")
    throw new PermanentJobError("github_uncertain")
  throw new Error("github_task_failed")
}

// Builds git in a freshly started sandbox and notes where GitHub stands.
// Also finishes a first commit that never happened; the queue retries transient failures.
export async function prepareProjectGit(
  app: FastifyInstance,
  projectId: string,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, archivedAt: null, workspace: { archivedAt: null } },
    select: { repo: true, workspace: { select: { userId: true } } },
  })
  // Repo exists but its first commit never happened: do it now.
  if (project?.repo?.managed && !project.repo.lastKnownSha) {
    requireBackgroundGitResult(await putOnGithub(app, projectId, false))
    return
  }
  if (!project || !onGithub(project.repo)) return
  const github = await ownerGithub(project.workspace.userId)
  if (!github) return

  const git: ProjectGit = { projectId, repo: project.repo, github }
  const locked = await withProjectLock(
    "commit",
    projectId,
    COMMIT_LOCK_TTL_MS,
    async () =>
      orchestratorGit<{ githubHead: string }>(app, projectId, "/git/prepare", {
        remote: await remoteFor(git),
      }),
  )
  if (!locked.ok) throw new Error("github_busy")
  const answer = locked.value
  if (answer.ok) {
    await noteGithubHead(projectId, git.repo, answer.data.githubHead)
  } else if (answer.reason === "refused") {
    await noteShift(projectId, git.repo, answer.refusal)
    if (answer.refusal.reason === "shift") {
      console.warn(
        `[git] ${projectId}: GitHub moved since ForgeAI's last commit (${answer.refusal.shift.kind})`,
      )
    }
  } else if (answer.reason !== "no_pod" && answer.reason !== "not_found") {
    throw new Error("github_prepare_failed")
  }
}

// ---------- WHEN GITHUB MOVED ----------

export type GithubStatus =
  /** Not on GitHub: nothing to check. */
  | { state: "none" }
  /** On GitHub, but the owner's GitHub is disconnected. */
  | { state: "disconnected"; repo: RepoRef }
  | { state: "same"; repo: RepoRef }
  /** GitHub has commits the project hasn't taken in; `details` is null until a sandbox is running. */
  | {
      state: "shift"
      repo: RepoRef
      githubHead: string
      details: GitShiftDetails | null
    }
  /** GitHub couldn't be reached. */
  | { state: "unknown"; repo: RepoRef; message: string }

// Loads the project's repo and its owner's GitHub (or just the repo if disconnected).
// Returns null when the project isn't on GitHub.
async function projectGitOf(
  projectId: string,
): Promise<ProjectGit | RepoRef | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { repo: true, workspace: { select: { userId: true } } },
  })
  if (!project || !onGithub(project.repo)) return null
  const github = await ownerGithub(project.workspace.userId)
  return github ? { projectId, repo: project.repo, github } : project.repo
}

// Returns GitHub's branch head, cached for a minute unless `fresh`.
// One API call; cheap enough to run on page open and focus.
async function githubHead(git: ProjectGit, fresh: boolean): Promise<string> {
  const { repo } = git
  if (
    !fresh &&
    repo.githubHeadSha &&
    repo.checkedAt &&
    Date.now() - repo.checkedAt.getTime() < HEAD_CHECK_TTL_MS
  ) {
    return repo.githubHeadSha
  }
  const token = await mintRepoToken(git.github.installationId, repo)
  return branchHeadSha(token, repo)
}

// Asks the sandbox what a shift brings in and what it clashes with.
// Returns null when no sandbox is running or it can't tell.
async function shiftDetails(
  app: FastifyInstance,
  projectId: string,
  git: ProjectGit,
): Promise<GitShiftDetails | null> {
  const answer = await orchestratorGit<GitCheckResult>(
    app,
    projectId,
    "/git/check",
    { remote: await remoteFor(git) },
  ).catch(() => null)
  if (!answer?.ok || answer.data.state !== "shift") return null
  return {
    kind: answer.data.kind,
    githubHead: answer.data.githubHead,
    commits: answer.data.commits,
    files: answer.data.files,
    localChanges: answer.data.localChanges,
    overlaps: answer.data.overlaps,
  }
}

// Reports whether GitHub is where ForgeAI left it, with shift details when it isn't.
// Open to anyone on the project; asked on page open, tab focus and the GitHub dialog.
export async function githubStatus(
  app: FastifyInstance,
  userId: string,
  projectId: string,
  fresh: boolean,
): Promise<GithubStatus | null> {
  if (
    !(await prisma.project.count({
      where: liveProjectFilter(userId, projectId),
    }))
  )
    return null

  const git = await projectGitOf(projectId)
  if (!git) return { state: "none" }
  if (!("github" in git)) return { state: "disconnected", repo: git }

  let head: string
  try {
    head = await githubHead(git, fresh)
  } catch (error) {
    return {
      state: "unknown",
      repo: git.repo,
      message: githubErrorMessage(error),
    }
  }
  await noteGithubHead(projectId, git.repo, head)
  if (head === git.repo.lastKnownSha) return { state: "same", repo: git.repo }

  const details = await shiftDetails(app, projectId, git)
  if (!details)
    return { state: "shift", repo: git.repo, githubHead: head, details: null }
  return {
    state: "shift",
    repo: git.repo,
    githubHead: details.githubHead,
    details,
  }
}

// Extracts the GitHub login from a noreply email (`12345+alice@users.noreply.github.com`).
// Used to credit commits brought in from GitHub.
function loginFromEmail(email: string): string | null {
  return (
    email.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/)?.[1] ?? null
  )
}

export type ResolveShiftResult =
  | { ok: true; data: { replaced: string[]; backup: string } }
  | { ok: false; reason: "not_found" | "no_github" | "busy" }
  | { ok: false; reason: "github"; message: string }
  | { ok: false; reason: "refused"; refusal: GitRefusal }
  | { ok: false; reason: SandboxFailure; message?: string }

// Checks who may resolve a shift: editors may take GitHub's changes, only the owner may keep theirs.
// Keeping yours is a commit, which is owner-only.
async function mayResolve(
  userId: string,
  projectId: string,
  choice: ShiftChoice,
): Promise<boolean> {
  if (choice === "mine") return ownsLiveProject(userId, projectId)
  return (
    (await prisma.project.count({
      where: projectAccessFilter(userId, projectId, "write"),
    })) > 0
  )
}

// Resolves a GitHub shift under the commit lock; GitHub must still be at `expectHead`.
// The first answer wins, and every tab is told what happened.
export async function resolveShift(
  app: FastifyInstance,
  userId: string,
  projectId: string,
  choice: ShiftChoice,
  expectHead: string,
  picks: ShiftPick[],
): Promise<ResolveShiftResult> {
  if (!(await mayResolve(userId, projectId, choice)))
    return { ok: false, reason: "not_found" }

  const git = await projectGitOf(projectId)
  if (!git || !("github" in git)) return { ok: false, reason: "no_github" }

  const locked = await withProjectLock(
    "commit",
    projectId,
    COMMIT_LOCK_TTL_MS,
    async (): Promise<ResolveShiftResult> => {
      let remote: GitRemote
      let bot: { name: string; email: string }
      try {
        ;[remote, bot] = await Promise.all([remoteFor(git), forgeBotIdentity()])
      } catch (error) {
        return {
          ok: false,
          reason: "github",
          message: githubErrorMessage(error),
        }
      }
      const { login, ...owner } = ownerGitAuthor(git.github)

      const answer = await orchestratorGit<GitResolveResult>(
        app,
        projectId,
        "/git/resolve",
        {
          remote,
          choice,
          expectHead,
          picks,
          // The backup is made as ForgeAI; a kept version is committed as the owner.
          author: choice === "mine" ? owner : bot,
          ...(choice === "mine" && {
            message: `${KEPT_MESSAGE}\n\nCo-authored-by: ${bot.name} <${bot.email}>`,
          }),
        },
      )
      if (!answer.ok) return answer

      const result = answer.data
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      })
      const commits = await recordResolution(projectId, git.repo, result, login)
      const repo = await prisma.repoRef.findUniqueOrThrow({
        where: { id: git.repo.id },
      })
      publishProjectEvent({
        type: "github.resolved",
        projectId,
        byName: user?.name || "Someone",
        choice,
        commits,
        repo,
        replaced: result.replaced,
        backup: result.backup,
      })
      return {
        ok: true,
        data: { replaced: result.replaced, backup: result.backup },
      }
    },
  )
  return locked.ok ? locked.value : { ok: false, reason: "busy" }
}

// Builds the history row for a commit brought in from GitHub.
// Credited to its GitHub author, dated when it was made.
function githubCommitRow(
  projectId: string,
  c: GitCommitInfo,
  isHead: boolean,
): Prisma.ProjectCommitUncheckedCreateInput {
  return {
    projectId,
    hash: c.sha,
    source: "GITHUB",
    author: c.authorName || "GitHub",
    authorLogin: loginFromEmail(c.authorEmail),
    prompt: c.message,
    filesChanged: c.files.length,
    additions: c.files.reduce((sum, f) => sum + f.additions, 0),
    deletions: c.files.reduce((sum, f) => sum + f.deletions, 0),
    files: c.files as unknown as Prisma.InputJsonValue,
    isHead,
    createdAt: new Date(c.date),
  }
}

// Builds the history row for the "kept my version" commit.
// Always becomes HEAD.
function keptCommitRow(
  projectId: string,
  commit: GitCommitResult,
  login: string,
): Prisma.ProjectCommitUncheckedCreateInput {
  return {
    projectId,
    hash: commit.sha,
    source: "FORGEAI",
    author: login,
    authorLogin: login,
    prompt: KEPT_MESSAGE,
    filesChanged: commit.files.length,
    additions: commit.additions,
    deletions: commit.deletions,
    files: commit.files as unknown as Prisma.InputJsonValue,
    isHead: true,
  }
}

// Updates History and `lastKnownSha` after a shift: GitHub's commits become rows, plus the kept commit.
// Commits already known are skipped; HEAD moves to the new base.
async function recordResolution(
  projectId: string,
  repo: RepoRef,
  result: GitResolveResult,
  login: string,
): Promise<ProjectCommit[]> {
  const known = new Set(
    (
      await prisma.projectCommit.findMany({
        where: { projectId, hash: { in: result.commits.map((c) => c.sha) } },
        select: { hash: true },
      })
    ).map((c) => c.hash),
  )
  const head = result.commit?.sha ?? result.newBase
  const incoming = result.commits.filter((c) => !known.has(c.sha))

  const rows = await prisma.$transaction(async (tx) => {
    await tx.projectCommit.updateMany({
      where: { projectId, isHead: true },
      data: { isHead: false },
    })
    const created = []
    for (const c of incoming) {
      created.push(
        await tx.projectCommit.create({
          data: githubCommitRow(projectId, c, !result.commit && c.sha === head),
        }),
      )
    }
    if (result.commit) {
      created.push(
        await tx.projectCommit.create({
          data: keptCommitRow(projectId, result.commit, login),
        }),
      )
    } else if (!incoming.some((c) => c.sha === head)) {
      // A rewritten history can land on a commit we already list: mark it HEAD.
      await tx.projectCommit.updateMany({
        where: { projectId, hash: head },
        data: { isHead: true },
      })
    }
    await tx.repoRef.update({
      where: { id: repo.id },
      data: { lastKnownSha: head, githubHeadSha: head, checkedAt: new Date() },
    })
    return created
  })
  return rows.map(toProjectCommit)
}

// Restores one file a shift replaced, from the shift's backup commit.
// Anyone who can edit; backs "Restore my version".
export async function restoreShiftFile(
  app: FastifyInstance,
  userId: string,
  projectId: string,
  backup: string,
  path: string,
): Promise<
  | { ok: true }
  | {
      ok: false
      reason: "not_found" | "refused" | SandboxFailure
      message?: string
    }
> {
  if (
    !(await prisma.project.count({
      where: projectAccessFilter(userId, projectId, "write"),
    }))
  ) {
    return { ok: false, reason: "not_found" }
  }
  const answer = await orchestratorGit<{ path: string }>(
    app,
    projectId,
    "/git/restore-file",
    { backup, path },
  )
  if (answer.ok) return { ok: true }
  if (answer.reason === "refused")
    return {
      ok: false,
      reason: "refused",
      message: "That file isn't in the backup",
    }
  return answer
}
