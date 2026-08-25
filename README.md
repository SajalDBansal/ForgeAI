# turbo-starter

A Turborepo starter with Next.js, Express, Fastify, a Commander CLI, Prisma, and shadcn/ui — all packages are ESM (`"type": "module"`).

## Apps

- `apps/web` — Next.js 16 app, styled with `@forgeAI/ui` (shadcn/ui + Tailwind v4), reads from `@forgeAI/database` directly.
- `apps/api` — Express 5 app (ESM, run with `tsx`/compiled with `tsc`), exposes a small REST API backed by `@forgeAI/database`.
- `apps/api-fast` — Fastify 5 app (same ESM/`tsx`/`tsc` setup as `api`), same routes backed by `@forgeAI/database`, on a separate port.
- `apps/cli` — empty Commander CLI scaffold (ESM). `inquirer` and `chalk` are installed as dependencies but not wired up yet — pull them into `src/index.ts` when adding real commands/prompts.
- `apps/docs` — Vite + React 19 SPA, styled with the same `@forgeAI/ui` (shadcn/ui + Tailwind v4) library as `web`.

## Packages

- `packages/typescript-config` — shared `tsconfig.json` bases (`base`, `nextjs`, `vite`, `react-library`, `node-library`).
- `packages/eslint-config` — shared ESLint 9 flat configs (`base`, `next`, `react-internal`, `node`).
- `packages/database` — Prisma 7 (driver adapters, `@prisma/adapter-pg`) with a singleton client exported from `@forgeAI/database`.
- `packages/ui` — shadcn/ui components (`new-york` style) built on `@base-ui/react` + Tailwind v4, exported as `@forgeAI/ui/components/*`.

## Getting started

```bash
bun install
cp .env.example .env
cp .env.example packages/database/.env
cp .env.example apps/api/.env
cp apps/api-fast/.env.example apps/api-fast/.env
cp .env.example apps/web/.env
```

Start Postgres locally:

```bash
docker compose up -d
```

Generate the Prisma client, push the schema, and seed some data:

```bash
bun run db:generate
bun run db:push
bun run db:seed
```

Run everything in dev mode:

```bash
bun run dev
```

- web: http://localhost:3000
- api: http://localhost:3001
- api-fast: http://localhost:3002
- docs: http://localhost:3003

## Scripts

| Script                      | What it does                                              |
| --------------------------- | --------------------------------------------------------- |
| `bun run build`             | `turbo run build` — builds every app/package              |
| `bun run dev`               | `turbo run dev` — runs every app/package in watch mode    |
| `bun run lint`              | `turbo run lint` — ESLint across the repo                 |
| `bun run typecheck`         | `turbo run typecheck` — `tsc --noEmit` across the repo    |
| `bun run format`            | `turbo run format` — Prettier                             |
| `bun run db:generate`       | Regenerate the Prisma client                              |
| `bun run db:push`           | Push `schema.prisma` to the database (no migration files) |
| `bun run db:migrate:dev`    | Create and apply a dev migration                          |
| `bun run db:migrate:deploy` | Apply migrations in production                            |
| `bun run db:seed`           | Seed the database                                         |
| `bun run db:studio`         | Open Prisma Studio                                        |

## CLI

```bash
bun run --cwd apps/cli dev -- --help
```

## Adding shadcn/ui components

Components live in `packages/ui/src/components` and are consumed as `@forgeAI/ui/components/<name>`:

```bash
bunx shadcn@latest add <component> -c packages/ui
```

## Docker

- `docker-compose.yml` — local dev database only (`docker compose up -d`).
- `docker-compose.prod.yml` — full stack (`db`, `api`, `api-fast`, `web`), each app built from its own `Dockerfile` via `turbo prune --docker`. `DATABASE_URL` for the apps is derived from `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` and points at the `db` service by name (not the root `.env`'s `localhost` value, which only works for host-side `bun dev`):

```bash
docker compose -f docker-compose.prod.yml up --build
```

Each app's `Dockerfile` (`apps/web`, `apps/api`, `apps/api-fast`) can also be built standalone; all three prune the workspace to just what that app needs before installing and building.
