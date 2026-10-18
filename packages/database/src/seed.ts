import "dotenv/config"

import { randomBytes, randomUUID } from "node:crypto"

import { hashPassword } from "better-auth/crypto"

import { prisma } from "./client.js"

// Templates are published separately (packages/templates); this only seeds demo data.

const SEED_EMAIL_DOMAIN = "@forge.test"
const PASSWORD = "Forge!2026"

// Returns a date `n` days in the past.
// Used to give seed rows realistic created/used timestamps.
const days = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

// Returns a date `n` minutes in the past.
// Used for "recently used" seed projects.
const minutes = (n: number) => new Date(Date.now() - n * 60 * 1000)

type SeedUser = Awaited<ReturnType<typeof createUser>>
type SeedUsers = { ada: SeedUser; grace: SeedUser; alan: SeedUser }
type SeedWorkspaces = Awaited<ReturnType<typeof seedWorkspaces>>

// Creates a verified user with the shared seed password.
// Used to populate demo accounts for local sign-in.
async function createUser(name: string, email: string) {
  const id = randomBytes(16).toString("hex")
  const user = await prisma.user.create({
    data: { id, name, email, emailVerified: true },
  })
  await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword(PASSWORD),
    },
  })
  return user
}

// Deletes every user on the seed email domain (cascading to their data).
// Makes the seed script safe to run repeatedly.
async function reset() {
  const { count: users } = await prisma.user.deleteMany({
    where: { email: { endsWith: SEED_EMAIL_DOMAIN } },
  })
  if (users) {
    console.log(`  cleared ${users} seed user(s)`)
  }
}

// Creates the three demo users.
// First step of the seed; everything else hangs off these accounts.
async function seedUsers(): Promise<SeedUsers> {
  const ada = await createUser("Ada Lovelace", `ada${SEED_EMAIL_DOMAIN}`)
  const grace = await createUser("Grace Hopper", `grace${SEED_EMAIL_DOMAIN}`)
  const alan = await createUser("Alan Turing", `alan${SEED_EMAIL_DOMAIN}`)
  console.log("  users: ada, grace, alan")
  return { ada, grace, alan }
}

// Creates a user's undeletable base workspace.
// Every real account gets one of these on sign-up.
function createBaseWorkspace(name: string, userId: string) {
  return prisma.workspace.create({
    data: {
      name,
      description: "This is the base workspace for the user.",
      deleteable: false,
      userId,
    },
  })
}

// Creates base, extra and archived workspaces for the demo users.
// Returns the ones later seed steps attach projects and collaborators to.
async function seedWorkspaces({ ada, grace, alan }: SeedUsers) {
  const adaBase = await createBaseWorkspace("Ada's Workspace", ada.id)
  const adaClients = await prisma.workspace.create({
    data: {
      name: "Client Work",
      description: "Contract builds",
      userId: ada.id,
    },
  })
  const adaArchived = await prisma.workspace.create({
    data: { name: "Old Experiments", userId: ada.id, archivedAt: days(30) },
  })
  const graceBase = await createBaseWorkspace("Grace's Workspace", grace.id)
  await createBaseWorkspace("Alan's Workspace", alan.id)
  console.log("  workspaces: 5 (1 archived)")
  return { adaBase, adaClients, adaArchived, graceBase }
}

// Creates demo projects in every status, including one archived.
// Gives the dashboard and project lists something to show.
async function seedProjects({
  adaBase,
  adaClients,
  adaArchived,
  graceBase,
}: SeedWorkspaces) {
  await prisma.project.createMany({
    data: [
      {
        name: "pulse-analytics",
        description: "Realtime product analytics for the marketing site",
        initialPrompt:
          "Build a realtime analytics dashboard with funnels and retention curves",
        status: "READY",
        starred: true,
        stack: ["react", "tailwind", "postgres"],
        mode: "BUILD",
        source: "MANUAL",
        workspaceId: adaBase.id,
        createdAt: days(21),
        lastUsed: minutes(12),
      },
      {
        name: "invoice-portal",
        description: "Client-facing invoice history and downloads",
        initialPrompt:
          "A portal where clients can see and download their invoices",
        status: "BUILDING",
        stack: ["react", "stripe"],
        mode: "BUILD",
        source: "GITHUB",
        workspaceId: adaClients.id,
        createdAt: days(9),
        lastUsed: minutes(90),
      },
      {
        name: "onboarding-flow",
        description: null,
        initialPrompt:
          "Design a three-step onboarding wizard with progress persistence",
        status: "PLANNING",
        stack: [],
        mode: "PLAN",
        source: "MANUAL",
        workspaceId: adaBase.id,
        createdAt: days(4),
        lastUsed: days(1),
      },
      {
        name: "support-inbox",
        description: "Threaded tickets with canned replies",
        initialPrompt:
          "Build a shared support inbox with threads, assignment and macros",
        status: "NEEDS_INPUT",
        stack: ["react", "postgres"],
        mode: "BUILD",
        source: "MANUAL",
        workspaceId: adaClients.id,
        createdAt: days(15),
        lastUsed: days(3),
      },
      {
        name: "pricing-page",
        description: "Three-tier pricing with a monthly/annual toggle",
        initialPrompt:
          "A pricing page with three tiers and an annual discount toggle",
        status: "READY",
        starred: true,
        stack: ["react", "tailwind"],
        mode: "BUILD",
        source: "MANUAL",
        workspaceId: graceBase.id,
        createdAt: days(6),
        lastUsed: days(2),
      },
      {
        name: "legacy-migration",
        description: "Abandoned jQuery port",
        initialPrompt: "Port the old jQuery admin screens to React",
        status: "READY",
        stack: ["react"],
        mode: "BUILD",
        source: "GITHUB",
        workspaceId: adaArchived.id,
        createdAt: days(60),
        lastUsed: days(45),
        archivedAt: days(28),
      },
    ],
  })
  console.log("  projects: 6 (1 archived)")
}

// Shares workspaces between the demo users with editor and viewer roles.
// Lets collaboration features be tested by signing in as different users.
async function seedCollaborators(
  { ada, grace, alan }: SeedUsers,
  { adaBase, adaClients, graceBase }: SeedWorkspaces,
) {
  await prisma.collaborator.createMany({
    data: [
      { workspaceId: adaBase.id, userId: grace.id, role: "EDITOR" },
      { workspaceId: adaClients.id, userId: alan.id, role: "VIEWER" },
      { workspaceId: adaClients.id, userId: grace.id, role: "EDITOR" },
      { workspaceId: graceBase.id, userId: ada.id, role: "EDITOR" },
    ],
  })
  console.log("  collaborators: 4")
}

// Creates one pending invitation to an email with no account.
// Exercises the invitations list and revoke flow.
async function seedInvitation(ada: SeedUser, { adaClients }: SeedWorkspaces) {
  await prisma.invitation.create({
    data: {
      workspaceId: adaClients.id,
      email: `margaret${SEED_EMAIL_DOMAIN}`,
      role: "VIEWER",
      status: "PENDING",
      invitedByUserId: ada.id,
      token: randomBytes(32).toString("hex"),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })
  console.log("  invitations: 1 pending")
}

// Prints the demo accounts and their shared password.
// Final step so the developer knows how to sign in.
function printCredentials(users: SeedUser[]) {
  console.log(
    "\ndone. sign in with any of these — password is the same for all:\n",
  )
  for (const { email } of users) {
    console.log(`  ${email.padEnd(22)} ${PASSWORD}`)
  }
  console.log("")
}

// Runs every seed step in order.
// Entry point for `bun run db:seed`.
async function main() {
  console.log("seeding…")
  await reset()

  const users = await seedUsers()
  const workspaces = await seedWorkspaces(users)
  await seedProjects(workspaces)
  await seedCollaborators(users, workspaces)
  await seedInvitation(users.ada, workspaces)
  printCredentials([users.ada, users.grace, users.alan])
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error: unknown) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
