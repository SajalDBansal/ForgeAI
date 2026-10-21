import { randomInt } from "node:crypto"
import { PermanentJobError } from "@forgeAI/jobs"

import { prisma, type Connection, type RepoRef } from "@forgeAI/database"

import {
  getInstallation,
  githubApi,
  mintInstallationWideToken,
} from "../lib/connections/github.js"
import {
  githubUserToken,
  type GithubConnectionSettings,
} from "./connections/github.service.js"

// Creating a project's GitHub repository. Everything pushed into it is done by git
// in the project's sandbox (see git-vc.service.ts).

/** Repositories ForgeAI creates are private, and named after the project. */
const REPO_PRIVATE = true

export interface OwnerGithub {
  connection: Connection
  installationId: string
  settings: GithubConnectionSettings
}

// Returns the git author for commits: the owner's GitHub login and noreply email.
// So commits show up on GitHub as the owner's own.
export function ownerGitAuthor(github: OwnerGithub): {
  name: string
  email: string
  login: string
} {
  const login =
    github.settings.userLogin ?? github.connection.externalAccountLogin
  const id = github.settings.userId ?? github.connection.externalAccountId
  return {
    name: login,
    email: `${id}+${login}@users.noreply.github.com`,
    login,
  }
}

// Loads the workspace owner's usable GitHub connection and installation.
// Returns null when GitHub isn't connected or installed.
export async function ownerGithub(
  workspaceOwnerId: string,
): Promise<OwnerGithub | null> {
  const connection = await prisma.connection.findUnique({
    where: {
      userId_provider: { userId: workspaceOwnerId, provider: "GITHUB" },
    },
  })
  const settings = (connection?.settingsJson ?? {}) as GithubConnectionSettings
  if (
    !connection ||
    connection.status !== "CONNECTED" ||
    !settings.installationId
  )
    return null
  return {
    connection,
    installationId: String(settings.installationId),
    settings,
  }
}

// Builds a repo name `<project name>-forgeAI-<4 digits>` using only characters GitHub allows.
// The random suffix avoids clashes; a clash just retries with another.
function repoNameFor(projectName: string): string {
  const base =
    projectName
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 60) || "project"
  return `${base}-forgeAI-${randomInt(1000, 10000)}`
}

type CreatedRepo = {
  id: number
  name: string
  owner: { login: string }
  default_branch: string
}

// Creates a private repo (with a README, since empty repos can't be written via the API).
// Uses the org endpoint for organizations and the user's own endpoint otherwise.
function createRepoOnGithub(
  token: string,
  organizationLogin: string | null,
  name: string,
  project: { name: string; description: string | null },
): Promise<CreatedRepo> {
  return githubApi<CreatedRepo>(
    token,
    "POST",
    organizationLogin
      ? `/orgs/${encodeURIComponent(organizationLogin)}/repos`
      : "/user/repos",
    {
      name,
      private: REPO_PRIVATE,
      description:
        project.description ?? `${project.name} — built with ForgeAI`,
      auto_init: true,
    },
  )
}

// Saves the new repo as a managed RepoRef and attaches it to the project.
// The final step of creating a project's repository.
async function linkRepo(
  projectId: string,
  repo: CreatedRepo,
  connectionId: string,
): Promise<RepoRef> {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { repo: true },
    })
    if (project.repo) return project.repo
    const ref = await tx.repoRef.upsert({
      where: { githubRepoId: String(repo.id) },
      create: {
        owner: repo.owner.login,
        name: repo.name,
        branch: repo.default_branch || "main",
        managed: true,
        githubRepoId: String(repo.id),
        connectionId,
      },
      update: {},
    })
    await tx.project.update({
      where: { id: projectId },
      data: { repoId: ref.id },
    })
    return ref
  })
}

// Creates the project's repository in the owner's account (org via the App, personal via the user) and links it.
// A durable intent prevents automatic retries from creating a second repository.
export async function createProjectRepo(
  project: { id: string; name: string; description: string | null },
  github: OwnerGithub,
): Promise<RepoRef> {
  const account = await getInstallation(github.installationId)
  const organization = account.accountType === "Organization"

  const token = organization
    ? await mintInstallationWideToken(github.installationId)
    : await githubUserToken(github.connection)
  if (!token) {
    throw new Error(
      "GitHub needs your permission to create repositories — reconnect GitHub from Connections.",
    )
  }

  const intent = await prisma.githubRepositoryIntent.upsert({
    where: { projectId: project.id },
    create: {
      projectId: project.id,
      owner: account.login,
      name: repoNameFor(project.name),
      connectionId: github.connection.id,
    },
    update: {},
  })
  if (
    intent.owner !== account.login ||
    intent.connectionId !== github.connection.id
  )
    throw new PermanentJobError("github_permission")
  let repo: CreatedRepo
  if (intent.githubRepoId) {
    repo = await githubApi<CreatedRepo>(
      token,
      "GET",
      `/repositories/${intent.githubRepoId}`,
    )
    if (repo.owner.login.toLowerCase() !== intent.owner.toLowerCase())
      throw new PermanentJobError("github_permission")
  } else {
    const claimed = await prisma.githubRepositoryIntent.updateMany({
      where: { projectId: project.id, attemptedAt: null },
      data: { attemptedAt: new Date() },
    })
    if (!claimed.count) throw new PermanentJobError("github_uncertain")
    // If the process dies between POST and recording the ID, an operator must reconcile it.
    // A timeout is not evidence that GitHub did not create the repository.
    repo = await createRepoOnGithub(
      token,
      organization ? account.login : null,
      intent.name,
      project,
    )
    await prisma.githubRepositoryIntent.update({
      where: { projectId: project.id },
      data: { githubRepoId: String(repo.id) },
    })
  }

  // Only a "selected repositories" installation needs the new repo added.
  if (!organization && account.repositorySelection === "selected") {
    await githubApi(
      token,
      "PUT",
      `/user/installations/${github.installationId}/repositories/${repo.id}`,
    )
  }

  return await linkRepo(project.id, repo, github.connection.id)
}
