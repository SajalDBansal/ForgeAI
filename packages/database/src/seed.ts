import "dotenv/config"

import { randomBytes, randomUUID } from "node:crypto"

import { hashPassword } from "better-auth/crypto"

import { prisma } from "./client.js"

const SEED_EMAIL_DOMAIN = "@forge.test"
const SEED_TEMPLATE_PREFIX = "seed/"
const PASSWORD = "Forge!2026"

const days = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)
const minutes = (n: number) => new Date(Date.now() - n * 60 * 1000)

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

async function reset() {
  const { count: users } = await prisma.user.deleteMany({
    where: { email: { endsWith: SEED_EMAIL_DOMAIN } },
  })
  const { count: templates } = await prisma.template.deleteMany({
    where: { storageRef: { startsWith: SEED_TEMPLATE_PREFIX } },
  })
  if (users || templates) {
    console.log(`  cleared ${users} seed user(s) and ${templates} seed template(s)`)
  }
}

const TEMPLATES = [
  {
    name: "saas-dashboard",
    description: "Metrics, billing, and team settings",
    tag: "SaaS",
    version: "1.4.0",
    author: "forge",
    license: "MIT",
    uses: 1284,
    metadata: {
      longDesc:
        "A production-shaped SaaS dashboard: usage metrics, Stripe billing, team management and role-aware navigation, all wired to a Postgres schema.",
      stack: [
        { name: "react", version: "19.0.0" },
        { name: "tailwindcss", version: "4.0.0" },
        { name: "typescript", version: "5.9.3" },
      ],
      connections: [
        { name: "Supabase", kind: "database", required: true },
        { name: "Stripe", kind: "payments", required: false },
      ],
      deps: [
        { name: "recharts", version: "2.12.0" },
        { name: "zod", version: "3.23.0" },
        { name: "date-fns", version: "4.1.0" },
      ],
      screens: [
        { name: "Overview", path: "/", desc: "KPI tiles and a usage chart" },
        { name: "Billing", path: "/billing", desc: "Plan, invoices and payment method" },
        { name: "Team", path: "/team", desc: "Members, roles and invitations" },
      ],
      envVars: [
        { key: "SUPABASE_URL", desc: "Project URL from the Supabase dashboard", required: true },
        { key: "STRIPE_SECRET_KEY", desc: "Server-side Stripe key", required: false },
      ],
      includes: ["Auth flows", "Billing page", "Role-based nav", "Dark mode", "Empty states"],
      dbSchema: [
        { table: "accounts", cols: "id, name, plan, created_at" },
        { table: "usage_events", cols: "id, account_id, metric, value, at" },
      ],
    },
  },
  {
    name: "docs-site",
    description: "MDX docs with search and versioning",
    tag: "Content",
    version: "2.1.0",
    author: "forge",
    license: "MIT",
    uses: 862,
    metadata: {
      longDesc:
        "A documentation site that reads MDX from the filesystem, builds a client-side search index at compile time, and supports multiple published versions side by side.",
      stack: [
        { name: "next", version: "16.3.3" },
        { name: "mdx", version: "3.1.0" },
      ],
      connections: [],
      deps: [
        { name: "shiki", version: "1.24.0" },
        { name: "flexsearch", version: "0.7.43" },
      ],
      screens: [
        { name: "Home", path: "/", desc: "Landing page with quick links" },
        { name: "Article", path: "/docs/[...slug]", desc: "Rendered MDX with a table of contents" },
      ],
      envVars: [],
      includes: ["Full-text search", "Version switcher", "Syntax highlighting", "RSS feed"],
    },
  },
  {
    name: "storefront",
    description: "Catalog, cart, and checkout",
    tag: "Commerce",
    version: "1.0.2",
    author: "forge",
    license: "Apache-2.0",
    uses: 517,
    metadata: {
      longDesc:
        "A storefront with a filterable catalog, a persisted cart and a Stripe checkout handoff. Inventory and orders live in Postgres.",
      stack: [
        { name: "react", version: "19.0.0" },
        { name: "tailwindcss", version: "4.0.0" },
      ],
      connections: [
        { name: "Stripe", kind: "payments", required: true },
        { name: "Supabase", kind: "database", required: true },
      ],
      deps: [
        { name: "zustand", version: "5.0.2" },
        { name: "zod", version: "3.23.0" },
      ],
      screens: [
        { name: "Catalog", path: "/", desc: "Grid with facet filters" },
        { name: "Product", path: "/p/[handle]", desc: "Gallery, variants and add-to-cart" },
        { name: "Checkout", path: "/checkout", desc: "Address, shipping and payment" },
      ],
      envVars: [
        { key: "STRIPE_SECRET_KEY", desc: "Server-side Stripe key", required: true },
        { key: "SUPABASE_URL", desc: "Project URL", required: true },
      ],
      includes: ["Cart persistence", "Variant picker", "Order confirmation email"],
      dbSchema: [
        { table: "products", cols: "id, handle, title, price_cents, inventory" },
        { table: "orders", cols: "id, email, total_cents, status, placed_at" },
      ],
    },
  },
  {
    name: "ai-chat-shell",
    description: "Streamed chat UI with tool calls",
    tag: "AI",
    version: "0.9.1",
    author: "forge",
    license: "MIT",
    uses: 2043,
    metadata: {
      longDesc:
        "A chat surface built for agents: token streaming, tool-call cards, permission prompts and a message history that survives reloads.",
      stack: [
        { name: "react", version: "19.0.0" },
        { name: "tailwindcss", version: "4.0.0" },
      ],
      connections: [{ name: "Anthropic", kind: "model provider", required: true }],
      deps: [{ name: "zustand", version: "5.0.2" }],
      screens: [
        { name: "Chat", path: "/", desc: "Composer, transcript and tool cards" },
        { name: "History", path: "/history", desc: "Past conversations" },
      ],
      envVars: [
        { key: "ANTHROPIC_API_KEY", desc: "Key used for streamed completions", required: true },
      ],
      includes: ["Token streaming", "Tool-call cards", "Permission prompts", "Stop button"],
    },
  },
  {
    name: "kanban-board",
    description: "Drag-drop columns and cards",
    tag: "Productivity",
    version: "1.1.0",
    author: "forge",
    license: "MIT",
    uses: 391,
    metadata: {
      longDesc:
        "A keyboard-accessible kanban board with optimistic drag and drop, per-column WIP limits and a card detail drawer.",
      stack: [{ name: "react", version: "19.0.0" }],
      connections: [],
      deps: [{ name: "dnd-kit", version: "6.3.1" }],
      screens: [{ name: "Board", path: "/", desc: "Columns, cards and the detail drawer" }],
      envVars: [],
      includes: ["Optimistic drag and drop", "Keyboard reordering", "WIP limits"],
      dbSchema: [{ table: "cards", cols: "id, column_id, title, position, updated_at" }],
    },
  },
] as const

async function main() {
  console.log("seeding…")
  await reset()

  const ada = await createUser("Ada Lovelace", `ada${SEED_EMAIL_DOMAIN}`)
  const grace = await createUser("Grace Hopper", `grace${SEED_EMAIL_DOMAIN}`)
  const alan = await createUser("Alan Turing", `alan${SEED_EMAIL_DOMAIN}`)
  console.log("  users: ada, grace, alan")

  const adaBase = await prisma.workspace.create({
    data: {
      name: "Ada's Workspace",
      description: "This is the base workspace for the user.",
      deleteable: false,
      userId: ada.id,
    },
  })
  const adaClients = await prisma.workspace.create({
    data: { name: "Client Work", description: "Contract builds", userId: ada.id },
  })
  const adaArchived = await prisma.workspace.create({
    data: { name: "Old Experiments", userId: ada.id, archivedAt: days(30) },
  })
  const graceBase = await prisma.workspace.create({
    data: {
      name: "Grace's Workspace",
      description: "This is the base workspace for the user.",
      deleteable: false,
      userId: grace.id,
    },
  })
  await prisma.workspace.create({
    data: {
      name: "Alan's Workspace",
      description: "This is the base workspace for the user.",
      deleteable: false,
      userId: alan.id,
    },
  })
  console.log("  workspaces: 5 (1 archived)")

  await prisma.project.createMany({
    data: [
      {
        name: "pulse-analytics",
        description: "Realtime product analytics for the marketing site",
        initialPrompt: "Build a realtime analytics dashboard with funnels and retention curves",
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
        initialPrompt: "A portal where clients can see and download their invoices",
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
        initialPrompt: "Design a three-step onboarding wizard with progress persistence",
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
        initialPrompt: "Build a shared support inbox with threads, assignment and macros",
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
        initialPrompt: "A pricing page with three tiers and an annual discount toggle",
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

  await prisma.collaborator.createMany({
    data: [
      { workspaceId: adaBase.id, userId: grace.id, role: "EDITOR" },
      { workspaceId: adaClients.id, userId: alan.id, role: "VIEWER" },
      { workspaceId: adaClients.id, userId: grace.id, role: "EDITOR" },
      { workspaceId: graceBase.id, userId: ada.id, role: "EDITOR" },
    ],
  })
  console.log("  collaborators: 4")

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

  for (const t of TEMPLATES) {
    await prisma.template.create({
      data: {
        name: t.name,
        description: t.description,
        tag: t.tag,
        version: t.version,
        author: t.author,
        license: t.license,
        uses: t.uses,
        storageRef: `${SEED_TEMPLATE_PREFIX}${t.name}`,
        workspaceId: null,
        metadata: t.metadata,
      },
    })
  }
  await prisma.template.create({
    data: {
      name: "client-report",
      description: "Branded PDF report generator",
      tag: "Internal",
      version: "0.3.0",
      author: "Ada Lovelace",
      license: "UNLICENSED",
      uses: 4,
      storageRef: `${SEED_TEMPLATE_PREFIX}client-report`,
      workspaceId: adaClients.id,
      metadata: {
        longDesc:
          "Generates a branded PDF report from a JSON payload. Private to the Client Work workspace.",
        stack: [{ name: "react", version: "19.0.0" }],
        connections: [],
        deps: [{ name: "@react-pdf/renderer", version: "4.1.5" }],
        screens: [{ name: "Preview", path: "/", desc: "Live preview of the rendered report" }],
        envVars: [],
        includes: ["Cover page", "Charts", "Page numbering"],
      },
    },
  })
  console.log(`  templates: ${TEMPLATES.length} curated + 1 private`)

  console.log("\ndone. sign in with any of these — password is the same for all:\n")
  for (const email of [ada.email, grace.email, alan.email]) {
    console.log(`  ${email.padEnd(22)} ${PASSWORD}`)
  }
  console.log("")
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
